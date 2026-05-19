import { NextResponse } from "next/server";
import { getResendClient } from "@/lib/resend";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { getMissingLeadsEnvVars, hasResendLeadConfig } from "@/lib/env";
import { checkMinInterval, checkRateLimit } from "@/lib/rate-limit";

type LeadPayload = {
  restaurantName: string;
  city: string;
  email: string;
  companyWebsite?: string;
  source?: string;
};

const SCRIPTED_UA_PATTERN =
  /(curl|wget|python-requests|scrapy|postmanruntime|insomnia|go-http-client|libwww-perl)/i;
const SPAM_RESPONSE_DELAY_MIN_MS = 250;
const SPAM_RESPONSE_DELAY_MAX_MS = 450;
const RATE_LIMIT_DELAY_MIN_MS = 250;
const RATE_LIMIT_DELAY_MAX_MS = 450;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSpamResponseDelayMs() {
  const range = SPAM_RESPONSE_DELAY_MAX_MS - SPAM_RESPONSE_DELAY_MIN_MS;
  return SPAM_RESPONSE_DELAY_MIN_MS + Math.floor(Math.random() * (range + 1));
}

function getRateLimitDelayMs() {
  const range = RATE_LIMIT_DELAY_MAX_MS - RATE_LIMIT_DELAY_MIN_MS;
  return RATE_LIMIT_DELAY_MIN_MS + Math.floor(Math.random() * (range + 1));
}

function validatePayload(payload: Partial<LeadPayload>) {
  if (!payload.restaurantName?.trim()) return "Restaurant name is required";
  if (!payload.city?.trim()) return "City is required";
  if (!payload.email?.trim()) return "Email is required";
  return null;
}

function normalizeLeadSource(source: string | undefined) {
  const value = source?.trim().toLowerCase() ?? "";
  if (!value) return "homepage";
  if (!/^[a-z0-9:_-]{1,64}$/.test(value)) return "homepage";
  return value;
}

function getAllowedOrigins() {
  const allowed = new Set<string>();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const manualOrigins = process.env.LEADS_ALLOWED_ORIGINS?.trim();

  if (appUrl) allowed.add(appUrl);
  if (manualOrigins) {
    manualOrigins
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => allowed.add(value));
  }

  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }

  return Array.from(allowed);
}

function isRequestOriginAllowed(request: Request) {
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.length === 0) return true;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  let refererOrigin: string | null = null;
  if (referer) {
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      refererOrigin = null;
    }
  }
  const effectiveOrigin = origin ?? refererOrigin;

  if (!effectiveOrigin) return false;
  return allowedOrigins.includes(effectiveOrigin);
}

function isLikelyBotRequest(request: Request) {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!userAgent) return false;
  return SCRIPTED_UA_PATTERN.test(userAgent);
}

export async function POST(request: Request) {
  const missingEnvVars = getMissingLeadsEnvVars();
  if (missingEnvVars.length > 0) {
    return NextResponse.json(
      {
        error: "Lead capture is not configured",
        missingEnvVars,
      },
      { status: 500 },
    );
  }

  if (!isRequestOriginAllowed(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  if (isLikelyBotRequest(request)) {
    await delay(getSpamResponseDelayMs());
    return NextResponse.json({ ok: true });
  }

  try {
    const body = (await request.json()) as Partial<LeadPayload>;

    // Honeypot: bots often fill hidden fields. Return success silently.
    if (body.companyWebsite?.trim()) {
      await delay(getSpamResponseDelayMs());
      return NextResponse.json({ ok: true });
    }

    const validationError = validatePayload(body);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const lead: LeadPayload = {
      restaurantName: body.restaurantName!.trim(),
      city: body.city!.trim(),
      email: body.email!.trim().toLowerCase(),
      source: normalizeLeadSource(body.source),
    };

    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

    // Burst protection per IP (block rapid repeated submissions).
    const intervalCheck = checkMinInterval({
      key: `leads:ip:interval:${ip}`,
      minIntervalMs: 8_000,
    });

    if (!intervalCheck.allowed) {
      await delay(getRateLimitDelayMs());
      return NextResponse.json(
        { error: "Too many requests, please wait a moment" },
        { status: 429 },
      );
    }

    // Rolling-window limits.
    const ipRateLimit = checkRateLimit({
      key: `leads:ip:window:${ip}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipRateLimit.allowed) {
      await delay(getRateLimitDelayMs());
      return NextResponse.json(
        { error: "Rate limit exceeded for this IP" },
        { status: 429 },
      );
    }

    const emailRateLimit = checkRateLimit({
      key: `leads:email:${lead.email}`,
      limit: 3,
      windowMs: 24 * 60 * 60 * 1000,
    });
    if (!emailRateLimit.allowed) {
      await delay(getRateLimitDelayMs());
      return NextResponse.json(
        { error: "Rate limit exceeded for this email" },
        { status: 429 },
      );
    }

    const supabase = getSupabaseAdminClient();

    const { error: insertError } = await supabase.from("audit_leads").insert({
      restaurant_name: lead.restaurantName,
      city: lead.city,
      email: lead.email,
      source: lead.source,
    });

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to store lead", details: insertError.message },
        { status: 500 },
      );
    }

    const notificationTo = process.env.LEADS_NOTIFICATION_TO;
    const fromEmail = process.env.LEADS_FROM_EMAIL;

    if (notificationTo && fromEmail && hasResendLeadConfig()) {
      const resend = getResendClient();

      await resend.emails.send({
        from: fromEmail,
        to: notificationTo,
        subject: `New foodnear.me ADO audit lead: ${lead.restaurantName}`,
        text: [
          "New ADO audit lead submitted.",
          `Restaurant: ${lead.restaurantName}`,
          `City: ${lead.city}`,
          `Email: ${lead.email}`,
          `Source: ${lead.source}`,
        ].join("\n"),
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Unexpected error while submitting lead" },
      { status: 500 },
    );
  }
}
