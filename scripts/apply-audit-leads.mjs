#!/usr/bin/env node
/**
 * Apply audit_leads migration to Supabase Postgres.
 *
 * Requires SUPABASE_DB_PASSWORD in .env.local (or env).
 * Get it from: Supabase Dashboard → Project Settings → Database → Database password
 *
 * Usage: node scripts/apply-audit-leads.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, "apps/web/.env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!supabaseUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}

if (!dbPassword) {
  console.error(`
Missing SUPABASE_DB_PASSWORD.

1. Open Supabase Dashboard → Project Settings → Database
2. Copy your database password (or reset it)
3. Add to .env.local:

   SUPABASE_DB_PASSWORD=your-password-here

Then run: npm run db:migrate:audit-leads
`);
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const connectionString =
  process.env.SUPABASE_DB_URL ??
  `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;

const migrationPath = resolve(
  root,
  "database/migrations/20260505_create_audit_leads.sql",
);
const sql = readFileSync(migrationPath, "utf8");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  console.log(`Connecting to Supabase project: ${projectRef}`);
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(
    "select to_regclass('public.audit_leads') as table_name",
  );
  if (rows[0]?.table_name) {
    console.log("✅ audit_leads table is ready.");
  } else {
    console.error("Migration ran but audit_leads was not found.");
    process.exit(1);
  }
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
