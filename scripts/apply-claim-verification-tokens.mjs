#!/usr/bin/env node
/**
 * Apply claim verification token migration to Supabase Postgres.
 *
 * Usage: npm run db:migrate:claim-verification-tokens
 */

import { connectToSupabasePostgres, readMigration } from "./lib/supabase-db.mjs";

const sql = readMigration("database/migrations/20260523_claim_verification_tokens.sql");
const { client } = await connectToSupabasePostgres();

try {
  await client.query(sql);
  console.log("claim_verification_tokens table is ready.");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
