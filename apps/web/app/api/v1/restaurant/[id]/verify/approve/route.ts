import { NextResponse } from "next/server";
import { approveMenuVerification } from "@/lib/menu-ingest/insert-indexed-menu";
import { checkMinInterval, checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type ApprovePayload = {
  email: string;
  agreeToTerms?: boolean;
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

    const intervalCheck = checkMinInterval({
      key: `verify:ip:interval:${ip}`,
      minIntervalMs: 5_000,
    });
    if (!intervalCheck.allowed) {
      return NextResponse.json({ error: "Too many requests, please wait" }, { status: 429 });
    }

    const ipRateLimit = checkRateLimit({
      key: `verify:ip:window:${ip}`,
      limit: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipRateLimit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const supabase = getSupabaseAdminClient();
    const result = await approveMenuVerification(supabase, restaurantId, email);

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
