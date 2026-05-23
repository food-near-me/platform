#!/usr/bin/env node
/**
 * Apply the race-safe approve RPC.
 *
 * Usage: npm run db:migrate:race-safe-approve
 */

import { connectToSupabasePostgres, readMigration } from "./lib/supabase-db.mjs";

const sql = readMigration("database/migrations/20260523_race_safe_approve.sql");
const { client } = await connectToSupabasePostgres();

try {
  await client.query(sql);
  console.log("Race-safe approve RPC applied:");
  console.log("  - approve_menu_verification_atomic(restaurant, expected_menu, sig, signer, ts)");
  console.log("  - GRANT EXECUTE to service_role only");

  const { rows } = await client.query(
    `SELECT proname,
            pg_get_function_arguments(oid) AS args,
            pg_get_function_result(oid)    AS returns
       FROM pg_proc
      WHERE proname = 'approve_menu_verification_atomic';`,
  );
  for (const row of rows) {
    console.log(`  signature: ${row.proname}(${row.args}) -> ${row.returns}`);
  }
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
