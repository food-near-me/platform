import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const metadata: Metadata = {
  title: "MCP Usage | Food Near Me",
  description:
    "Public, PII-free usage dashboard for the foodnear.me MCP server. 24h tool aggregates, tier distribution, recent invocations, 30-day rollup.",
};

// Tools change rarely; this avoids hammering the rollup views on every load
// while still surfacing fresh-enough numbers for human operators.
export const revalidate = 60;

type ToolStat = {
  tool_name: string;
  success_count: number;
  error_count: number;
  total_count: number;
  avg_duration_ms: number | null;
  p95_duration_ms: number | null;
  last_invocation_at: string | null;
};

type TierStat = {
  tool_name: string;
  tier_returned: string;
  invocations: number;
};

type DailyStat = {
  day: string;
  tool_name: string;
  status: string;
  tier_returned: string | null;
  invocations: number;
  avg_duration_ms: number | null;
  p95_duration_ms: number | null;
};

type RecentRow = {
  tool_name: string;
  status: string;
  error_code: string | null;
  tier_returned: string | null;
  results_count: number | null;
  duration_ms: number | null;
  occurred_at: string;
};

type DashboardData =
  | {
      configured: true;
      lifetime: number;
      claimSurfaceProxy: number;
      perTool: ToolStat[];
      perTier: TierStat[];
      daily: DailyStat[];
      recent: RecentRow[];
      collectedAt: string;
    }
  | { configured: false; reason: string };

async function loadDashboard(): Promise<DashboardData> {
  let supabase;
  try {
    supabase = getSupabaseAdminClient();
  } catch (err) {
    return {
      configured: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  // Fire all queries concurrently; each is bounded and cheap.
  const [
    perToolRes,
    perTierRes,
    dailyRes,
    recentRes,
    lifetimeRes,
    claimProxyRes,
  ] = await Promise.all([
    supabase.from("mcp_invocations_24h").select("*"),
    supabase.from("mcp_tier_distribution_24h").select("*"),
    supabase
      .from("mcp_invocations_daily")
      .select("*")
      .order("day", { ascending: false })
      .limit(60),
    supabase
      .from("mcp_invocations")
      .select(
        "tool_name, status, error_code, tier_returned, results_count, duration_ms, occurred_at",
      )
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase.from("mcp_invocations").select("id", { count: "exact", head: true }),
    supabase
      .from("mcp_invocations")
      .select("id", { count: "exact", head: true })
      .eq("status", "success")
      .in("tier_returned", ["menu_indexed", "discovered"]),
  ]);

  return {
    configured: true,
    lifetime: lifetimeRes.count ?? 0,
    claimSurfaceProxy: claimProxyRes.count ?? 0,
    perTool: (perToolRes.data ?? []) as ToolStat[],
    perTier: (perTierRes.data ?? []) as TierStat[],
    daily: (dailyRes.data ?? []) as DailyStat[],
    recent: (recentRes.data ?? []) as RecentRow[],
    collectedAt: new Date().toISOString(),
  };
}

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US");
}

function fmtMs(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("en-US")}ms`;
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { hour12: false, timeZoneName: "short" });
}

function tierBadgeClasses(tier: string | null | undefined): string {
  if (tier === "verified") return "bg-emerald-950/40 text-emerald-300 ring-emerald-500/30";
  if (tier === "menu_indexed") return "bg-amber-950/40 text-amber-300 ring-amber-500/30";
  if (tier === "discovered") return "bg-zinc-800/60 text-zinc-400 ring-zinc-600/30";
  return "bg-zinc-900/60 text-zinc-500 ring-zinc-700/30";
}

function statusBadgeClasses(status: string): string {
  if (status === "success") return "bg-emerald-950/40 text-emerald-300 ring-emerald-500/30";
  if (status === "error") return "bg-rose-950/40 text-rose-300 ring-rose-500/30";
  return "bg-zinc-900/60 text-zinc-400 ring-zinc-700/30";
}

export default async function McpUsagePage() {
  const data = await loadDashboard();

  if (!data.configured) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-semibold tracking-tight mb-3">MCP Usage</h1>
          <p className="text-zinc-400">
            Stats unavailable: <span className="font-mono">{data.reason}</span>.
          </p>
          <p className="mt-4 text-sm text-zinc-500">
            Configure <span className="font-mono text-zinc-300">SUPABASE_SERVICE_ROLE_KEY</span>{" "}
            to enable this dashboard.
          </p>
        </div>
      </main>
    );
  }

  const { lifetime, claimSurfaceProxy, perTool, perTier, daily, recent, collectedAt } = data;

  const totals = perTool.reduce(
    (acc, t) => {
      acc.total += t.total_count;
      acc.success += t.success_count;
      acc.error += t.error_count;
      return acc;
    },
    { total: 0, success: 0, error: 0 },
  );
  const successRate = totals.total > 0 ? (totals.success / totals.total) * 100 : null;
  const topTool = [...perTool].sort((a, b) => b.total_count - a.total_count)[0];
  const tierTotalsByTier = perTier.reduce<Record<string, number>>((acc, row) => {
    acc[row.tier_returned] = (acc[row.tier_returned] ?? 0) + row.invocations;
    return acc;
  }, {});
  const topTier = Object.entries(tierTotalsByTier).sort((a, b) => b[1] - a[1])[0];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-amber-400/90 mb-2">
              Public usage stats
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">MCP Usage</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Aggregates only; no PII. Refreshed every minute.{" "}
              <a
                href="/api/health/mcp"
                className="text-amber-400/90 hover:underline font-mono text-xs"
              >
                /api/health/mcp
              </a>
            </p>
          </div>
          <p className="text-xs text-zinc-500">
            Collected: <span className="font-mono">{fmtTimestamp(collectedAt)}</span>
          </p>
        </div>

        <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile
            label="24h invocations"
            value={fmtNumber(totals.total)}
            sublabel={
              successRate !== null
                ? `${successRate.toFixed(1)}% success`
                : "no traffic yet"
            }
          />
          <KpiTile
            label="Lifetime"
            value={fmtNumber(lifetime)}
            sublabel="rows in mcp_invocations"
          />
          <KpiTile
            label="Top tool (24h)"
            value={topTool ? topTool.tool_name : "—"}
            sublabel={topTool ? `${fmtNumber(topTool.total_count)} calls` : "—"}
            mono
          />
          <KpiTile
            label="Claim invitations shipped"
            value={fmtNumber(claimSurfaceProxy)}
            sublabel="successful non-verified responses (proxy)"
          />
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Per-tool (last 24h)</h2>
          {perTool.length === 0 ? (
            <p className="text-sm text-zinc-500">No invocations in the last 24 hours.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <Th>Tool</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">OK</Th>
                    <Th align="right">Err</Th>
                    <Th align="right">Avg</Th>
                    <Th align="right">p95</Th>
                    <Th>Last call</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...perTool]
                    .sort((a, b) => b.total_count - a.total_count)
                    .map((t) => (
                      <tr key={t.tool_name} className="border-t border-zinc-800/60">
                        <Td mono>{t.tool_name}</Td>
                        <Td align="right">{fmtNumber(t.total_count)}</Td>
                        <Td align="right" subtle>
                          {fmtNumber(t.success_count)}
                        </Td>
                        <Td align="right" subtle>
                          {fmtNumber(t.error_count)}
                        </Td>
                        <Td align="right">{fmtMs(t.avg_duration_ms)}</Td>
                        <Td align="right">{fmtMs(t.p95_duration_ms)}</Td>
                        <Td subtle>{fmtTimestamp(t.last_invocation_at)}</Td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Tier distribution (last 24h)</h2>
          {perTier.length === 0 ? (
            <p className="text-sm text-zinc-500">No tier-bearing invocations yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <Th>Tool</Th>
                    <Th>Tier returned</Th>
                    <Th align="right">Invocations</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...perTier]
                    .sort((a, b) => b.invocations - a.invocations)
                    .map((row) => (
                      <tr
                        key={`${row.tool_name}-${row.tier_returned}`}
                        className="border-t border-zinc-800/60"
                      >
                        <Td mono>{row.tool_name}</Td>
                        <Td>
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${tierBadgeClasses(row.tier_returned)}`}
                          >
                            {row.tier_returned}
                          </span>
                        </Td>
                        <Td align="right">{fmtNumber(row.invocations)}</Td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="px-4 py-3 text-xs text-zinc-500 border-t border-zinc-800/60">
                Top tier this window:{" "}
                <span className="font-mono text-zinc-300">{topTier?.[0] ?? "—"}</span>{" "}
                ({fmtNumber(topTier?.[1] ?? 0)} invocations).
              </p>
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Recent invocations</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-zinc-500">No rows yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <Th>Time</Th>
                    <Th>Tool</Th>
                    <Th>Status</Th>
                    <Th>Tier</Th>
                    <Th align="right">Results</Th>
                    <Th align="right">Latency</Th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => (
                    <tr
                      key={`${r.occurred_at}-${i}`}
                      className="border-t border-zinc-800/60"
                    >
                      <Td subtle>{fmtTimestamp(r.occurred_at)}</Td>
                      <Td mono>{r.tool_name}</Td>
                      <Td>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${statusBadgeClasses(r.status)}`}
                        >
                          {r.status}
                          {r.error_code ? ` · ${r.error_code}` : ""}
                        </span>
                      </Td>
                      <Td>
                        {r.tier_returned ? (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${tierBadgeClasses(r.tier_returned)}`}
                          >
                            {r.tier_returned}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </Td>
                      <Td align="right" subtle>
                        {fmtNumber(r.results_count)}
                      </Td>
                      <Td align="right">{fmtMs(r.duration_ms)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Daily rollup (last 30 days)</h2>
          {daily.length === 0 ? (
            <p className="text-sm text-zinc-500">No daily data yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40">
              <table className="min-w-full text-sm">
                <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <Th>Day</Th>
                    <Th>Tool</Th>
                    <Th>Status</Th>
                    <Th>Tier</Th>
                    <Th align="right">Calls</Th>
                    <Th align="right">Avg</Th>
                    <Th align="right">p95</Th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((d, i) => (
                    <tr key={`${d.day}-${d.tool_name}-${i}`} className="border-t border-zinc-800/60">
                      <Td subtle mono>{d.day.slice(0, 10)}</Td>
                      <Td mono>{d.tool_name}</Td>
                      <Td>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${statusBadgeClasses(d.status)}`}
                        >
                          {d.status}
                        </span>
                      </Td>
                      <Td>
                        {d.tier_returned ? (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${tierBadgeClasses(d.tier_returned)}`}
                          >
                            {d.tier_returned}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </Td>
                      <Td align="right">{fmtNumber(d.invocations)}</Td>
                      <Td align="right" subtle>
                        {fmtMs(d.avg_duration_ms)}
                      </Td>
                      <Td align="right" subtle>
                        {fmtMs(d.p95_duration_ms)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 mb-10">
          <h2 className="text-base font-medium mb-2">Notes</h2>
          <ul className="space-y-2 text-sm text-zinc-400 list-disc list-inside">
            <li>
              All counts are aggregates from{" "}
              <span className="font-mono text-zinc-300">mcp_invocations</span> and its
              rollup views. No per-call payloads, prompts, or PII are stored or shown.
            </li>
            <li>
              <strong className="text-zinc-300">Claim invitations shipped</strong> is a
              proxy: count of successful, non-verified-tier invocations (every such
              response carries a structured{" "}
              <span className="font-mono text-zinc-300">claim_invitation</span>{" "}
              payload).
            </li>
            <li>
              Raw rows are retained for 90 days then GC&apos;d by{" "}
              <span className="font-mono text-zinc-300">
                /api/cron/cleanup-mcp-invocations
              </span>
              ; rollup views and lifetime count remain unaffected.
            </li>
            <li>
              Errors with code{" "}
              <span className="font-mono text-zinc-300">VALIDATION_ERROR</span> are
              expected from flow tests and bad agent input; treat the success-rate KPI
              with that context.
            </li>
          </ul>
        </section>

        <p className="text-sm text-zinc-500">
          Connect your MCP host:{" "}
          <Link href="/docs" className="text-amber-400/90 hover:underline">
            /docs
          </Link>{" "}
          · Agent skill bundle:{" "}
          <a
            href="/skills/foodnearme/SKILL.md"
            className="text-amber-400/90 hover:underline"
          >
            /skills/foodnearme/SKILL.md
          </a>
        </p>
      </div>
    </main>
  );
}

function KpiTile({
  label,
  value,
  sublabel,
  mono = false,
}: {
  label: string;
  value: string;
  sublabel?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">{label}</p>
      <p
        className={`text-2xl font-semibold text-zinc-100 ${mono ? "font-mono text-base" : ""}`}
      >
        {value}
      </p>
      {sublabel ? <p className="text-xs text-zinc-500 mt-1">{sublabel}</p> : null}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const alignClass = align === "right" ? "text-right" : "text-left";
  return (
    <th
      className={`px-4 py-2 font-medium ${alignClass}`}
      scope="col"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  mono = false,
  subtle = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  subtle?: boolean;
}) {
  const alignClass = align === "right" ? "text-right" : "text-left";
  const monoClass = mono ? "font-mono text-xs text-zinc-200" : "text-sm";
  const subtleClass = subtle ? "text-zinc-500" : "text-zinc-300";
  return (
    <td className={`px-4 py-2 ${alignClass} ${monoClass} ${subtleClass}`}>{children}</td>
  );
}
