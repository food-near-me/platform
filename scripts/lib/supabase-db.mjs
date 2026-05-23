import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const root = resolve(__dirname, "../..");

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

export function loadProjectEnv() {
  loadEnvFile(resolve(root, ".env.local"));
  loadEnvFile(resolve(root, "apps/web/.env.local"));
}

export function getProjectRef() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
  }
  return new URL(supabaseUrl).hostname.split(".")[0];
}

function buildConnectionCandidates(projectRef) {
  if (process.env.SUPABASE_DB_URL) {
    return [process.env.SUPABASE_DB_URL];
  }

  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!dbPassword) {
    throw new Error("Missing SUPABASE_DB_URL or SUPABASE_DB_PASSWORD");
  }

  const encodedPassword = encodeURIComponent(dbPassword);
  const dbRegion = process.env.SUPABASE_DB_REGION?.trim();
  const regions = dbRegion
    ? [dbRegion]
    : [
        "us-east-1",
        "us-east-2",
        "us-west-1",
        "us-west-2",
        "ca-central-1",
        "eu-west-1",
        "eu-west-2",
        "eu-central-1",
        "ap-south-1",
        "ap-southeast-1",
        "ap-southeast-2",
        "ap-northeast-1",
        "sa-east-1",
      ];

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

async function tryConnect(connectionString) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12_000,
  });
  await client.connect();
  return client;
}

export async function connectToSupabasePostgres() {
  loadProjectEnv();
  const projectRef = getProjectRef();

  let candidates;
  try {
    candidates = buildConnectionCandidates(projectRef);
  } catch (error) {
    console.error(`
${error.message}

Reliable fix:
  1. Supabase Dashboard -> Project Settings -> Database -> Connection string
  2. Copy the URI connection string
  3. Add it to .env.local:

     SUPABASE_DB_URL=postgresql://...

Then rerun the migration command.
`);
    process.exit(1);
  }

  const errors = [];
  for (const connectionString of candidates) {
    const hostMatch = connectionString.match(/@([^:/]+)/);
    const host = hostMatch?.[1] ?? "unknown";
    try {
      console.log(`Connecting (${host})...`);
      const client = await tryConnect(connectionString);
      console.log(`Connected via ${host}`);
      return { client, projectRef };
    } catch (error) {
      errors.push(`${host}: ${error.message}`);
    }
  }

  console.error("\nMigration failed: could not connect to Postgres.\n");
  for (const line of errors.slice(0, 8)) console.error(`  - ${line}`);
  console.error(`
Reliable fix:
  Add the exact Supabase connection URI to .env.local as SUPABASE_DB_URL.
  If you need to proceed now, paste the migration SQL into:
  https://supabase.com/dashboard/project/${projectRef}/sql/new
`);
  process.exit(1);
}

export function readMigration(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}
