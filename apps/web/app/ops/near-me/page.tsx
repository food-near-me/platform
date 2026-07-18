import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { getSql, isDatabaseConfigured } from "@/lib/db/neon";
import { isOpsAuthed } from "@/lib/ops-auth";

export const metadata: Metadata = {
  title: "Near-me usage — ops",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Totals = {
  n: number;
  ok_n: number;
  fail_n: number;
  first_at: string | null;
  last_at: string | null;
};

type DayRow = {
  d: string;
  n: number;
  ok_n: number;
  with_need: number;
  with_hood: number;
  geo_n: number;
};

type QueryRow = { q: string; n: number };

async function loadUsage(days: number): Promise<{
  totals: Totals;
  byDay: DayRow[];
  topQueries: QueryRow[];
}> {
  const sql = getSql();
  const totals = (await sql.query(
    `SELECT
       count(*)::int AS n,
       count(*) FILTER (WHERE ok)::int AS ok_n,
       count(*) FILTER (WHERE NOT ok)::int AS fail_n,
       min(created_at) AS first_at,
       max(created_at) AS last_at
     FROM near_me_usage
     WHERE created_at > now() - make_interval(days => $1::int)`,
    [days],
  )) as Totals[];

  const byDay = (await sql.query(
    `SELECT
       date_trunc('day', created_at)::date AS d,
       count(*)::int AS n,
       count(*) FILTER (WHERE ok)::int AS ok_n,
       count(*) FILTER (WHERE query ILIKE '%need:%')::int AS with_need,
       count(*) FILTER (WHERE query ILIKE '%hood:%')::int AS with_hood,
       count(*) FILTER (WHERE source = 'geo')::int AS geo_n
     FROM near_me_usage
     WHERE created_at > now() - make_interval(days => $1::int)
     GROUP BY 1
     ORDER BY 1 DESC`,
    [days],
  )) as DayRow[];

  const topQueries = (await sql.query(
    `SELECT
       coalesce(nullif(trim(query), ''), '(empty)') AS q,
       count(*)::int AS n
     FROM near_me_usage
     WHERE created_at > now() - make_interval(days => $1::int)
       AND ok
     GROUP BY 1
     ORDER BY n DESC
     LIMIT 15`,
    [days],
  )) as QueryRow[];

  return {
    totals: totals[0] ?? {
      n: 0,
      ok_n: 0,
      fail_n: 0,
      first_at: null,
      last_at: null,
    },
    byDay,
    topQueries,
  };
}

function fmtWhen(v: string | null): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return v;
  }
}

function fmtDay(v: string): string {
  try {
    return new Date(v).toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return v;
  }
}

export default async function OpsNearMePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const daysRaw = parseInt(sp.days || "14", 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 90 ? daysRaw : 14;

  if (!(await isOpsAuthed())) {
    return (
      <SiteShell variant="consumer" crumb="ops">
        <section className="section">
          <div className="section-head">
            <p className="label">ops</p>
            <h1 className="near-me-title">Near-me usage</h1>
            <p className="lede">
              Founder-only. Sign in by POSTing{" "}
              <code className="ops-code">OPS_SECRET</code> to{" "}
              <code className="ops-code">/ops/login</code> (sets an httpOnly
              session cookie).
            </p>
          </div>
        </section>
      </SiteShell>
    );
  }

  if (!isDatabaseConfigured()) {
    return (
      <SiteShell variant="consumer" crumb="ops">
        <section className="section">
          <div className="section-head">
            <p className="label">ops</p>
            <h1 className="near-me-title">Near-me usage</h1>
            <p className="lede">Database not configured.</p>
          </div>
        </section>
      </SiteShell>
    );
  }

  const { totals, byDay, topQueries } = await loadUsage(days);

  return (
    <SiteShell variant="consumer" crumb="ops">
      <section className="section">
        <div className="section-head">
          <p className="label">ops · path a signal</p>
          <h1 className="near-me-title">Near-me usage</h1>
          <p className="lede">
            Last {days} days · {totals.n} searches ({totals.ok_n} ok / {totals.fail_n} fail)
            · first {fmtWhen(totals.first_at)} · last {fmtWhen(totals.last_at)}
          </p>
          <p className="ops-day-links">
            {[7, 14, 30].map((d) => (
              <Link key={d} href={`/ops/near-me?days=${d}`}>
                {d}d
              </Link>
            ))}
            <span className="ops-sep">·</span>
            <Link href="/">← site</Link>
          </p>
        </div>

        <div className="section-body full">
          <div className="near-me-panel ops-panel">
            <h2 className="ops-h2">By day</h2>
            {byDay.length === 0 ? (
              <p className="ops-empty">No rows yet — share a link, then refresh.</p>
            ) : (
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>n</th>
                    <th>ok</th>
                    <th>need</th>
                    <th>hood</th>
                    <th>geo</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map((row) => (
                    <tr key={String(row.d)}>
                      <td>{fmtDay(String(row.d))}</td>
                      <td>{row.n}</td>
                      <td>{row.ok_n}</td>
                      <td>{row.with_need}</td>
                      <td>{row.with_hood}</td>
                      <td>{row.geo_n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h2 className="ops-h2">Top query tags</h2>
            {topQueries.length === 0 ? (
              <p className="ops-empty">None yet.</p>
            ) : (
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>n</th>
                    <th>tag</th>
                  </tr>
                </thead>
                <tbody>
                  {topQueries.map((row) => (
                    <tr key={row.q}>
                      <td>{row.n}</td>
                      <td>
                        <code className="ops-code">{row.q}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p className="near-me-footnote">
              No PII — city/source/query tags only. CLI twin:{" "}
              <code className="ops-code">npm run db:usage:near-me</code>
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
