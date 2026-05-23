#!/usr/bin/env node
/**
 * Apply site_health_cache table migration.
 *
 * Usage: npm run db:migrate:site-health-cache
 */

import { connectToSupabasePostgres, readMigration } from "./lib/supabase-db.mjs";

const sql = readMigration("database/migrations/20260524_site_health_cache.sql");
const { client } = await connectToSupabasePostgres();

try {
  await client.query(sql);

  const { rows } = await client.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='site_health_cache' order by ordinal_position",
  );
  if (rows.length === 0) {
    throw new Error("site_health_cache table missing after migration");
  }

  console.log(
    `site_health_cache table ready with columns: ${rows.map((r) => r.column_name).join(", ")}`,
  );
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
