#!/usr/bin/env node
/**
 * Apply migration that adds the `request_id` column to mcp_invocations.
 *
 * Usage: npm run db:migrate:mcp-invocations-request-id
 */

import { connectToSupabasePostgres, readMigration } from "./lib/supabase-db.mjs";

const sql = readMigration("database/migrations/20260524_mcp_invocations_request_id.sql");
const { client } = await connectToSupabasePostgres();

try {
  await client.query(sql);

  const { rows } = await client.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='mcp_invocations' and column_name='request_id'",
  );
  if (rows.length !== 1) {
    throw new Error("request_id column missing after migration");
  }

  console.log("mcp_invocations.request_id column ready (+ index).");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
