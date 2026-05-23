#!/usr/bin/env node
/**
 * Apply RLS hardening migration to Supabase Postgres.
 *
 * Usage: npm run db:migrate:rls-hardening
 */

import { connectToSupabasePostgres, readMigration } from "./lib/supabase-db.mjs";

const sql = readMigration("database/migrations/20260523_rls_hardening.sql");
const { client } = await connectToSupabasePostgres();

try {
  await client.query(sql);
  console.log("RLS hardening applied:");
  console.log("  - restaurants/menus/menu_categories/menu_items: anon SELECT only");
  console.log("  - audit_leads/claim_verification_tokens/mcp_invocations: service_role only");
  console.log("");
  console.log("Run `npm run db:verify:rls` to confirm anon writes fail and PII reads return empty.");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
