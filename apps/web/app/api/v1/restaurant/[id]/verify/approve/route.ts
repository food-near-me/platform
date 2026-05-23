import { NextResponse } from "next/server";
import { isTrustedOwnerEmail } from "@/lib/claim/ownership";
import {
  consumeClaimVerificationToken,
  validateClaimVerificationToken,
} from "@/lib/claim/tokens";
import { approveMenuVerification } from "@/lib/menu-ingest/insert-indexed-menu";
import { checkMinInterval, checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type ApprovePayload = {
  email: string;
  agreeToTerms?: boolean;
  claimToken?: string;
};

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: restaurantId } = await params;

  try {
    const body = (await request.json()) as Partial<ApprovePayload>;
    const email = body.email?.trim().toLowerCase() ?? "";

    if (!validateEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!body.agreeToTerms) {
      return NextResponse.json(
        { error: "You must confirm menu accuracy before approving" },
        { status: 400 },
      );
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

    const intervalCheck = await checkMinInterval({
      key: `verify:ip:interval:${ip}`,
      minIntervalMs: 5_000,
    });
    if (!intervalCheck.allowed) {
      return NextResponse.json({ error: "Too many requests, please wait" }, { status: 429 });
    }

    const ipRateLimit = await checkRateLimit({
      key: `verify:ip:window:${ip}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipRateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id, website_url")
      .eq("id", restaurantId)
      .single();

    if (restaurantError || !restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    if (!isTrustedOwnerEmail(email, restaurant.website_url)) {
      return NextResponse.json(
        {
          error:
            "Use an email address on the restaurant website domain, or request manual review.",
        },
        { status: 403 },
      );
    }

    const claimRecord = await validateClaimVerificationToken(
      supabase,
      restaurantId,
      body.claimToken,
    );

    if (!claimRecord || claimRecord.email !== email) {
      return NextResponse.json(
        { error: "Valid claim verification link required" },
        { status: 403 },
      );
    }

    const result = await approveMenuVerification(supabase, restaurantId, email);
    if (!result.alreadyVerified) {
      await consumeClaimVerificationToken(supabase, claimRecord.id);
    }

    return NextResponse.json({
      ok: true,
      menuId: result.menuId,
      alreadyVerified: result.alreadyVerified,
    });
  } catch (error) {
    console.error("Verify approve error:", error);
    const message = error instanceof Error ? error.message : "Approval failed";
    const status = message === "Restaurant not found" ? 404 : message.includes("No menu") ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
