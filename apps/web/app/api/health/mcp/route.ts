import { NextResponse } from "next/server";
import { getMcpInvocationStats } from "@/lib/mcp/instrumentation";

/**
 * Public MCP usage health endpoint.
 *
 * Returns 24-hour aggregates of MCP tool invocations across the three trust
 * tiers. Designed for:
 *   - operator dashboards
 *   - the North-Star KPI ("weekly successful tier-labeled agent invocations")
 *   - public transparency for agents and registry maintainers
 *
 * Never exposes per-request payloads or PII — only counts, latencies, and tier
 * distributions. Returns `ok: true` with empty aggregates when Supabase is
 * unconfigured locally so the route stays usable in dev/CI without secrets.
 */
export async function GET() {
  try {
    const stats = await getMcpInvocationStats();
    return NextResponse.json(
      {
        ok: true,
        ...stats,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "Failed to read MCP usage stats",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
