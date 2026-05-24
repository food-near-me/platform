#!/usr/bin/env node
/**
 * Apply the `get_restaurant_coordinates(p_ids uuid[])` Postgres function.
 *
 * Usage: npm run db:migrate:get-restaurant-coordinates
 */

import { connectToSupabasePostgres, readMigration } from "./lib/supabase-db.mjs";

const sql = readMigration(
  "database/migrations/20260524_get_restaurant_coordinates.sql",
);
const { client } = await connectToSupabasePostgres();

try {
  await client.query(sql);

  const { rows } = await client.query(
    `select pg_get_function_result(p.oid) as return_type,
            pg_get_function_arguments(p.oid) as args
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'get_restaurant_coordinates'`,
  );

  if (rows.length === 0) {
    throw new Error("get_restaurant_coordinates function missing after migration");
  }

  console.log(
    `get_restaurant_coordinates ready · args=(${rows[0].args}) · returns=${rows[0].return_type}`,
  );

  // Smoke-test: call the function with an empty array; should return 0 rows
  // without erroring. Validates signature + visibility under the connection's role.
  const smoke = await client.query(
    "select id, latitude, longitude from public.get_restaurant_coordinates(array[]::uuid[])",
  );
  console.log(`Smoke call returned ${smoke.rowCount} rows (expected 0).`);
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
