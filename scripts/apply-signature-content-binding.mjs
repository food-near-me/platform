#!/usr/bin/env node
/**
 * Apply the content-bound signature migration (fnm-v1).
 *
 * Usage: npm run db:migrate:signature-content-binding
 */

import { connectToSupabasePostgres, readMigration } from "./lib/supabase-db.mjs";

const sql = readMigration("database/migrations/20260523_signature_content_binding.sql");
const { client } = await connectToSupabasePostgres();

try {
  await client.query(sql);
  console.log("Content-bound signature migration applied.");

  const cols = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'menus'
        AND column_name IN ('payload_hash', 'signing_format')
      ORDER BY column_name;`,
  );
  console.log("  Columns present:", cols.rows.map((r) => r.column_name).join(", "));

  const counts = await client.query(
    `SELECT signing_format, count(*)::int AS n
       FROM menus
      WHERE signature_hash IS NOT NULL
      GROUP BY signing_format
      ORDER BY signing_format NULLS LAST;`,
  );
  for (const row of counts.rows) {
    console.log(`  signing_format=${row.signing_format ?? "(NULL)"} count=${row.n}`);
  }

  const fns = await client.query(
    `SELECT proname, pg_get_function_arguments(oid) AS args
       FROM pg_proc
      WHERE proname = 'approve_menu_verification_atomic';`,
  );
  for (const row of fns.rows) {
    console.log(`  fn signature: ${row.proname}(${row.args})`);
  }
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
