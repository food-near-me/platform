#!/usr/bin/env npx tsx
/**
 * Print near_me_usage summary for Path A kill/go checks.
 *
 * Usage:
 *   npx tsx scripts/near-me-usage.ts
 *   npx tsx scripts/near-me-usage.ts --days=14
 *
 * Env: DATABASE_URL in apps/web/.env.local
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { getSql, isDatabaseConfigured } from "../lib/db/neon";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function argInt(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const n = parseInt(raw.split("=")[1] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  if (!isDatabaseConfigured()) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const days = argInt("days", 14);
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
  )) as {
    n: number;
    ok_n: number;
    fail_n: number;
    first_at: string | null;
    last_at: string | null;
  }[];

  const byDay = (await sql.query(
    `SELECT
       date_trunc('day', created_at)::date AS d,
       count(*)::int AS n,
       count(*) FILTER (WHERE ok)::int AS ok_n,
       count(*) FILTER (WHERE query ILIKE '%need:%')::int AS with_need,
       count(*) FILTER (WHERE query ILIKE '%hood:%')::int AS with_hood
     FROM near_me_usage
     WHERE created_at > now() - make_interval(days => $1::int)
     GROUP BY 1
     ORDER BY 1 DESC`,
    [days],
  )) as {
    d: string;
    n: number;
    ok_n: number;
    with_need: number;
    with_hood: number;
  }[];

  const topQueries = (await sql.query(
    `SELECT
       coalesce(nullif(trim(query), ''), '(empty)') AS q,
       count(*)::int AS n
     FROM near_me_usage
     WHERE created_at > now() - make_interval(days => $1::int)
       AND ok
     GROUP BY 1
     ORDER BY n DESC
     LIMIT 12`,
    [days],
  )) as { q: string; n: number }[];

  const t = totals[0];
  console.log(`\nnear_me_usage — last ${days} days`);
  console.log(`  total=${t?.n ?? 0} ok=${t?.ok_n ?? 0} fail=${t?.fail_n ?? 0}`);
  console.log(`  first=${t?.first_at ?? "—"} last=${t?.last_at ?? "—"}`);
  console.log("\nBy day:");
  if (!byDay.length) {
    console.log("  (no rows)");
  } else {
    for (const row of byDay) {
      console.log(
        `  ${row.d}  n=${row.n} ok=${row.ok_n} need=${row.with_need} hood=${row.with_hood}`,
      );
    }
  }
  console.log("\nTop query tags:");
  if (!topQueries.length) {
    console.log("  (none)");
  } else {
    for (const row of topQueries) {
      console.log(`  ${String(row.n).padStart(3)}  ${row.q}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
