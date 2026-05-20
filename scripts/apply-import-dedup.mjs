#!/usr/bin/env node
/**
 * Apply M3/M4 import migration (find_nearby_for_import RPC + import_runs table).
 *
 * Usage: npm run db:migrate:import-dedup
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
const dbRegion = process.env.SUPABASE_DB_REGION?.trim();

if (!supabaseUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}

if (!dbPassword && !process.env.SUPABASE_DB_URL) {
  console.error(`
Missing SUPABASE_DB_PASSWORD (or SUPABASE_DB_URL).

Paste the full URI from Supabase Dashboard → Connect → Direct:
  SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@...

Then run: npm run db:migrate:import-dedup
`);
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const encodedPassword = dbPassword ? encodeURIComponent(dbPassword) : null;

function buildConnectionCandidates() {
  if (process.env.SUPABASE_DB_URL) {
    return [process.env.SUPABASE_DB_URL];
  }
  const regions = dbRegion
    ? [dbRegion]
    : ["us-west-1", "us-west-2", "us-east-1", "us-east-2", "eu-west-1"];
  const candidates = [
    `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`,
  ];
  for (const region of regions) {
    candidates.push(
      `postgresql://postgres.${projectRef}:${encodedPassword}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.${projectRef}:${encodedPassword}@aws-0-${region}.pooler.supabase.com:6543/postgres`,
    );
  }
  return candidates;
}

const migrationPath = resolve(
  root,
  "database/migrations/20260521_import_dedup_rpc.sql",
);
const sql = readFileSync(migrationPath, "utf8");

async function tryConnect(connectionString) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12_000,
  });
  await client.connect();
  return client;
}

let client;
const candidates = buildConnectionCandidates();
const errors = [];

for (const connectionString of candidates) {
  const hostMatch = connectionString.match(/@([^:/]+)/);
  const host = hostMatch?.[1] ?? "unknown";
  try {
    console.log(`Connecting (${host})…`);
    client = await tryConnect(connectionString);
    console.log(`✓ Connected via ${host}`);
    break;
  } catch (error) {
    errors.push(`${host}: ${error.message}`);
    client = undefined;
  }
}

if (!client) {
  console.error("\nMigration failed: could not connect to Postgres.\n");
  for (const line of errors.slice(0, 6)) console.error(`  - ${line}`);
  console.error(`
Or paste database/migrations/20260521_import_dedup_rpc.sql into Supabase SQL Editor.

Project: https://supabase.com/dashboard/project/${projectRef}/sql/new
`);
  process.exit(1);
}

try {
  await client.query(sql);
  const { rows } = await client.query(`
    SELECT proname FROM pg_proc
    WHERE proname = 'find_nearby_for_import'
  `);
  if (rows.length) {
    console.log("✅ Import dedup migration applied (find_nearby_for_import + import_runs).");
    console.log("\nNext:");
    console.log("  cd apps/web && npm run db:import:discovered -- --region=queens --dry-run");
  } else {
    console.error("Migration ran but find_nearby_for_import was not found.");
    process.exit(1);
  }
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
