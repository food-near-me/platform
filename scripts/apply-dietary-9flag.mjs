#!/usr/bin/env node
/**
 * Apply the 9-flag dietary surface migration to Supabase Postgres.
 *
 * Usage: npm run db:migrate:dietary-9flag
 *
 * Verifies row counts after the migration so the operator can confirm the
 * new columns landed and the unsafe nut_free backfill cleared.
 */

import { connectToSupabasePostgres, readMigration } from "./lib/supabase-db.mjs";

const sql = readMigration("database/migrations/20260523_dietary_9flag.sql");
const { client } = await connectToSupabasePostgres();

try {
  await client.query(sql);
  console.log("Dietary 9-flag migration applied.");

  const newColumnsRes = await client.query(
    `SELECT
       count(*) FILTER (WHERE dietary_dairy_free) AS dairy_free,
       count(*) FILTER (WHERE dietary_low_carb)   AS low_carb,
       count(*) FILTER (WHERE dietary_keto)       AS keto
     FROM menu_items;`,
  );
  const row = newColumnsRes.rows[0];
  console.log(
    `  New columns added (all default FALSE): dairy_free=${row.dairy_free}, ` +
      `low_carb=${row.low_carb}, keto=${row.keto}`,
  );

  const lingeringUnsafe = await client.query(
    `SELECT count(*)::int AS n
     FROM menu_items mi
     JOIN menu_categories mc ON mc.id = mi.category_id
     JOIN menus m            ON m.id = mc.menu_id
     JOIN restaurants r      ON r.id = m.restaurant_id
     WHERE r.verification_status = 'menu_indexed'
       AND mi.dietary_nut_free = TRUE
       AND (mi.allergens IS NULL OR cardinality(mi.allergens) = 0);`,
  );
  console.log(
    `  Indexed items still claiming nut_free without allergen data: ${lingeringUnsafe.rows[0].n} (target 0)`,
  );

  const cleaned = await client.query(
    `SELECT count(*)::int AS n
     FROM menu_items mi
     JOIN menu_categories mc ON mc.id = mi.category_id
     JOIN menus m            ON m.id = mc.menu_id
     JOIN restaurants r      ON r.id = m.restaurant_id
     WHERE r.verification_status = 'menu_indexed'
       AND mi.dietary_nut_free = FALSE;`,
  );
  console.log(
    `  Indexed items now safely defaulting nut_free=false: ${cleaned.rows[0].n}`,
  );
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
