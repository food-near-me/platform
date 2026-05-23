import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasPaidAuth } from "./auth";
import { loadX402Config } from "./config";
import { buildPaymentRequiredBody } from "./format402";
import type { X402Endpoint } from "./types";

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

/**
 * Returns a 402 NextResponse when x402 is enabled, quota is exceeded, and no paid auth.
 * Returns null when the request should proceed.
 *
 * Async because rate-limit storage may be remote (Upstash). When the in-memory
 * fallback is used the call resolves synchronously on the next microtask.
 */
export async function checkX402Access(
  request: Request,
  endpoint: X402Endpoint
): Promise<NextResponse | null> {
  const cfg = loadX402Config();
  if (!cfg.enabled) {
    return null;
  }

  if (hasPaidAuth(request)) {
    return null;
  }

  const ip = getClientIp(request);
  const key = `x402:${endpoint}:${ip}`;
  const { allowed, remaining } = await checkRateLimit({
    key,
    limit: cfg.freeQuotaPerDay,
    windowMs: cfg.quotaWindowMs,
  });

  if (allowed) {
    return null;
  }

  const body = buildPaymentRequiredBody({ endpoint, cfg });

  return NextResponse.json(body, {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      "X-Payment-Required": "x402",
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Limit": String(cfg.freeQuotaPerDay),
      "X-Payment-Message": "Free tier quota exceeded; payment or API auth required",
    },
  });
}
