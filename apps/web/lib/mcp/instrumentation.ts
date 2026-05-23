/**
 * MCP usage instrumentation.
 *
 * Records per-tool, per-tier invocations to Supabase. Writes are best-effort
 * and fire-and-forget so tool-call latency is unaffected when Supabase is slow
 * or unconfigured. Use `getMcpInvocationStats` for the public health endpoint.
 *
 * Schema: database/migrations/20260523_mcp_invocations.sql
 */

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type McpInvocationRecord = {
  toolName: string;
  status: "success" | "error";
  errorCode?: string;
  tierReturned?: string | null;
  resultsCount?: number | null;
  durationMs: number;
};

function adminClientOrNull() {
  try {
    return getSupabaseAdminClient();
  } catch {
    return null;
  }
}

/**
 * Best-effort write to mcp_invocations. Never throws; never blocks.
 *
 * Caller should `void recordMcpInvocation(...)` after computing the result.
 * Failures are logged once but do not surface to the agent.
 */
export async function recordMcpInvocation(record: McpInvocationRecord): Promise<void> {
  const supabase = adminClientOrNull();
  if (!supabase) return;

  try {
    const { error } = await supabase.from("mcp_invocations").insert({
      tool_name: record.toolName,
      status: record.status,
      error_code: record.errorCode ?? null,
      tier_returned: record.tierReturned ?? null,
      results_count: record.resultsCount ?? null,
      duration_ms: record.durationMs,
    });
    if (error && process.env.NODE_ENV !== "production") {
      console.warn("[mcp instrumentation] insert failed:", error.message);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[mcp instrumentation] unexpected error:", err);
    }
  }
}

/**
 * Inspect a tool result and return the dominant tier label, used as the
 * `tier_returned` dimension for instrumentation. Prefers the highest tier
 * present in a list of search results; falls back to a top-level field on
 * single-restaurant responses.
 */
export function extractTierLabel(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;

  const obj = result as Record<string, unknown>;

  if (Array.isArray(obj.results)) {
    const tiers = new Set<string>();
    for (const row of obj.results as Array<Record<string, unknown>>) {
      const v = row?.verification_status;
      if (typeof v === "string") tiers.add(v);
    }
    if (tiers.has("verified")) return "verified";
    if (tiers.has("menu_indexed")) return "menu_indexed";
    if (tiers.has("discovered")) return "discovered";
    return null;
  }

  if (typeof obj.verification_status === "string") {
    return obj.verification_status;
  }
  return null;
}

/** Count rows returned (search) for the `results_count` dimension. */
export function extractResultsCount(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const obj = result as Record<string, unknown>;
  if (typeof obj.results_count === "number") return obj.results_count;
  if (Array.isArray(obj.results)) return obj.results.length;
  return null;
}

// ============================================================================
// Aggregates (read side, for /api/health/mcp)
// ============================================================================

export type McpToolStats = {
  tool_name: string;
  success_count: number;
  error_count: number;
  total_count: number;
  avg_duration_ms: number | null;
  p95_duration_ms: number | null;
  last_invocation_at: string | null;
};

export type McpTierStat = {
  tool_name: string;
  tier_returned: string;
  invocations: number;
};

export type McpInvocationStats = {
  configured: boolean;
  window_hours: 24;
  totals: {
    invocations: number;
    success: number;
    error: number;
  };
  per_tool: McpToolStats[];
  per_tier: McpTierStat[];
  collected_at: string;
};

export async function getMcpInvocationStats(): Promise<McpInvocationStats> {
  const supabase = adminClientOrNull();
  const collectedAt = new Date().toISOString();

  if (!supabase) {
    return {
      configured: false,
      window_hours: 24,
      totals: { invocations: 0, success: 0, error: 0 },
      per_tool: [],
      per_tier: [],
      collected_at: collectedAt,
    };
  }

  const [{ data: perTool, error: tErr }, { data: perTier, error: dErr }] = await Promise.all([
    supabase.from("mcp_invocations_24h").select("*"),
    supabase.from("mcp_tier_distribution_24h").select("*"),
  ]);

  if (tErr || dErr) {
    throw new Error(
      `Failed to read MCP stats: ${tErr?.message ?? ""} ${dErr?.message ?? ""}`.trim(),
    );
  }

  const tools = (perTool ?? []) as McpToolStats[];
  const tiers = (perTier ?? []) as McpTierStat[];

  const totals = tools.reduce(
    (acc, t) => {
      acc.invocations += t.total_count ?? 0;
      acc.success += t.success_count ?? 0;
      acc.error += t.error_count ?? 0;
      return acc;
    },
    { invocations: 0, success: 0, error: 0 },
  );

  return {
    configured: true,
    window_hours: 24,
    totals,
    per_tool: tools,
    per_tier: tiers,
    collected_at: collectedAt,
  };
}
