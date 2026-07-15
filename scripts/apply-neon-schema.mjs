/**
 * Apply FNM schema + migrations to Neon over the HTTP driver
 * (TCP from this box times out behind VPN; HTTP :443 works).
 *
 * Usage: node --env-file=.env.local scripts/apply-neon-schema.mjs
 *
 * Skips Supabase-only RLS / role grants (anon, authenticated, service_role).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sql = neon(url);

/** Split SQL into statements, respecting dollar-quoting ($$ / $tag$). */
function splitSql(input) {
  const statements = [];
  let buf = "";
  let i = 0;
  let inDollar = null; // tag including $
  let inSingle = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < input.length) {
    const c = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      buf += c;
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      buf += c;
      if (c === "*" && next === "/") {
        buf += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++;
      continue;
    }
    if (inSingle) {
      buf += c;
      if (c === "'" && next === "'") {
        buf += next;
        i += 2;
        continue;
      }
      if (c === "'") inSingle = false;
      i++;
      continue;
    }
    if (inDollar) {
      buf += c;
      if (input.startsWith(inDollar, i)) {
        buf += inDollar.slice(1);
        i += inDollar.length;
        inDollar = null;
        continue;
      }
      i++;
      continue;
    }

    if (c === "-" && next === "-") {
      buf += c;
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      buf += c;
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === "'") {
      buf += c;
      inSingle = true;
      i++;
      continue;
    }
    if (c === "$") {
      const rest = input.slice(i);
      const m = rest.match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        inDollar = m[0];
        buf += m[0];
        i += m[0].length;
        continue;
      }
    }
    if (c === ";") {
      const stmt = buf.trim();
      if (stmt) statements.push(stmt);
      buf = "";
      i++;
      continue;
    }
    buf += c;
    i++;
  }
  const tail = buf.trim();
  if (tail) statements.push(tail);
  return statements;
}

function shouldSkipStatement(stmt) {
  const s = stmt.toLowerCase();
  // Supabase role/RLS artifacts — Neon uses a single owner role
  if (s.includes("to anon") || s.includes("to authenticated") || s.includes("to service_role"))
    return true;
  if (s.includes("from anon") || s.includes("from authenticated")) return true;
  if (s.includes("row level security")) return true;
  if (s.includes("create policy") || s.includes("drop policy")) return true;
  if (s.includes("enable row level security") || s.includes("disable row level security"))
    return true;
  if (s.includes("revoke all on")) return true;
  return false;
}

async function runFile(label, path) {
  const raw = readFileSync(path, "utf8");
  const statements = splitSql(raw);
  let ran = 0;
  let skipped = 0;
  for (const stmt of statements) {
    if (shouldSkipStatement(stmt)) {
      skipped++;
      continue;
    }
    try {
      await sql.query(stmt);
      ran++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // idempotent-ish: ignore already-exists on re-run
      if (/already exists/i.test(msg)) {
        ran++;
        continue;
      }
      console.error(`\nFAIL in ${label}:\n${stmt.slice(0, 200)}...\n→ ${msg}`);
      throw err;
    }
  }
  console.log(`OK  ${label}  (${ran} ran, ${skipped} skipped supabase-role/RLS)`);
}

async function main() {
  console.log("Neon HTTP migrate starting…");
  await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
  console.log("OK  postgis");

  await runFile("schema-supabase.sql", join(root, "database/schema-supabase.sql"));

  const migDir = join(root, "database/migrations");
  const files = readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    if (f.includes("rls_hardening")) {
      console.log(`SKIP ${f} (Supabase RLS — not used on Neon)`);
      continue;
    }
    await runFile(f, join(migDir, f));
  }

  const tables = await sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  console.log(
    "tables:",
    tables.map((r) => r.tablename).join(", "),
  );

  const fns = await sql`
    SELECT proname FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname LIKE '%restaurant%'
    ORDER BY proname
  `;
  console.log(
    "restaurant fns:",
    fns.map((r) => r.proname).join(", "),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
