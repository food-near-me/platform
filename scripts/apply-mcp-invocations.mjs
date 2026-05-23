#!/usr/bin/env node
/**
 * Apply MCP invocation instrumentation migration to Supabase Postgres.
 *
 * Usage: npm run db:migrate:mcp-invocations
 */

import { connectToSupabasePostgres, readMigration } from "./lib/supabase-db.mjs";

const sql = readMigration("database/migrations/20260523_mcp_invocations.sql");
const { client } = await connectToSupabasePostgres();

try {
  await client.query(sql);
  console.log("mcp_invocations table + rollup views are ready.");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
