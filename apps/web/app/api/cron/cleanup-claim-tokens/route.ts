import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Daily cleanup of stale `claim_verification_tokens`.
 *
 * Why this exists:
 *   - Each time an owner clicks "claim my listing" we insert a one-time
 *     verification token with a 24-hour TTL. Successful claims set
 *     `used_at`. Abandoned claims are never used and accumulate forever.
 *   - Indefinite retention is a privacy footgun: the rows store the
 *     claimant's email plus the restaurant they tried to claim, which
 *     in aggregate is a "who's claiming what" log we have no use for
 *     past the verification window.
 *
 * Retention policy (intentionally conservative):
 *   - `used_at IS NOT NULL` and `used_at < now() - 7 days`  -> delete.
 *     Successful claims older than a week are not useful for incident
 *     review; the restaurant's `verification_status` is the auditable
 *     record of the outcome.
 *   - `used_at IS NULL` and `expires_at < now() - 7 days`   -> delete.
 *     The token expired a week ago and was never used; nothing to
 *     resurrect.
 *
 * Auth: this route is gated by a shared CRON_SECRET. Vercel Cron sends
 *   `Authorization: Bearer <CRON_SECRET>` automatically when the secret
 *   is configured in project env. Manual invocations (debug, ops) can
 *   pass the same header.
 *
 * Schedule: declared in `apps/web/vercel.json` as a daily 03:17 UTC job.
 */

const RETENTION_GRACE_DAYS = 7;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail closed when the secret is missing so a misconfigured deploy
    // doesn't silently allow public hits to this route.
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  // Also accept a custom header for manual ops (curl from a workstation).
  if (request.headers.get("x-cron-secret") === expected) return true;
  return false;
}

export async function POST(request: Request) {
  return handle(request);
}

// Vercel Cron historically calls cron routes with GET. Accept both so the
// platform's transport choice doesn't matter.
export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const cutoff = new Date(Date.now() - RETENTION_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const usedDelete = await supabase
    .from("claim_verification_tokens")
    .delete({ count: "exact" })
    .not("used_at", "is", null)
    .lt("used_at", cutoff);

  if (usedDelete.error) {
    return NextResponse.json(
      { ok: false, stage: "delete_used", error: usedDelete.error.message },
      { status: 500 },
    );
  }

  const expiredDelete = await supabase
    .from("claim_verification_tokens")
    .delete({ count: "exact" })
    .is("used_at", null)
    .lt("expires_at", cutoff);

  if (expiredDelete.error) {
    return NextResponse.json(
      { ok: false, stage: "delete_expired", error: expiredDelete.error.message },
      { status: 500 },
    );
  }

  const { count: remaining, error: countError } = await supabase
    .from("claim_verification_tokens")
    .select("id", { count: "exact", head: true });

  if (countError) {
    // Non-fatal; we already deleted, just couldn't read the residual count.
    console.warn("cleanup-claim-tokens: could not read residual count", countError.message);
  }

  return NextResponse.json({
    ok: true,
    cutoff,
    deleted_used: usedDelete.count ?? 0,
    deleted_expired: expiredDelete.count ?? 0,
    remaining: remaining ?? null,
    retention_grace_days: RETENTION_GRACE_DAYS,
    note: `Deleted claim_verification_tokens where used_at < ${cutoff} or (used_at IS NULL AND expires_at < ${cutoff}).`,
  });
}
