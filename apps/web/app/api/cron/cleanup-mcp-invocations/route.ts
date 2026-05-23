import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { log } from "@/lib/log";

/**
 * Daily cleanup of stale `mcp_invocations` rows.
 *
 * Why this exists:
 *   - Every MCP tool call writes a row (success or error). The table is
 *     append-only and grows monotonically with agent traffic; the rollup
 *     views (`mcp_invocations_24h`, `mcp_invocations_daily`) are what
 *     the public `/api/health/mcp` endpoint reads, not the raw rows.
 *   - Beyond ~90 days the raw rows are dead weight: the rollup views
 *     only look back 30 days, and operational debugging rarely benefits
 *     from quarter-old raw data.
 *
 * Retention policy: 90 days (encoded in
 *   database/migrations/20260524_mcp_invocations_retention.sql as the
 *   default arg to public.cleanup_old_mcp_invocations).
 *
 * Auth: shared CRON_SECRET pattern, same as cleanup-claim-tokens.
 * Schedule: declared in apps/web/vercel.json as a daily 03:33 UTC job
 *   (offset from the 03:17 claim-token cleanup so we don't burn
 *   Supabase connection budget at the same instant).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  if (request.headers.get("x-cron-secret") === expected) return true;
  return false;
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.rpc("cleanup_old_mcp_invocations", {
    retention_days: 90,
  });

  if (error) {
    log.error("cron.cleanup_mcp_invocations.failed", { error: error.message });
    return NextResponse.json(
      { ok: false, stage: "rpc", error: error.message },
      { status: 500 },
    );
  }

  const deleted = typeof data === "number" ? data : 0;
  log.info("cron.cleanup_mcp_invocations.ok", { deleted });

  return NextResponse.json({
    ok: true,
    deleted,
    retention_days: 90,
    note: "Deleted mcp_invocations rows older than 90 days.",
  });
}
