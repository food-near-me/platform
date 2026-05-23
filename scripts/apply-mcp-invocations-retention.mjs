#!/usr/bin/env node
/**
 * Apply migration that installs the cleanup_old_mcp_invocations() function.
 *
 * Usage: npm run db:migrate:mcp-invocations-retention
 */

import { connectToSupabasePostgres, readMigration } from "./lib/supabase-db.mjs";

const sql = readMigration("database/migrations/20260524_mcp_invocations_retention.sql");
const { client } = await connectToSupabasePostgres();

try {
  await client.query(sql);

  const { rows } = await client.query(
    "select proname from pg_proc where proname='cleanup_old_mcp_invocations'",
  );
  if (rows.length === 0) {
    throw new Error("cleanup_old_mcp_invocations() not created");
  }

  const dryRun = await client.query("select public.cleanup_old_mcp_invocations(36500)::int as rows_deleted");
  console.log(
    `cleanup_old_mcp_invocations() ready. Dry sanity invocation (100y retention) deleted ${dryRun.rows[0].rows_deleted} row(s).`,
  );
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
