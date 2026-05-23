-- Phase 3a: full 9-flag dietary surface + indexed-menu backfill.
--
-- Adds the 3 dietary columns that menu-protocol-v1 defines but the original
-- schema omitted (dairy_free, low_carb, keto). All default FALSE so existing
-- rows do not silently flip claims.
--
-- Also corrects the legacy `dietary_nut_free` inference for indexed menus:
-- before this migration, indexed items where `allergens` was null/empty
-- were stamped `dietary_nut_free = TRUE` (asserting "this is nut-free"
-- with zero allergen data behind it). We flip those rows back to FALSE
-- so agents stop seeing false-positive nut-free claims on indexed menus
-- until an explicit nut-free signal is captured.
--
-- Apply via:
--   npm run db:migrate:dietary-9flag
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe on re-run; the UPDATE is
-- narrow enough to no-op when re-applied because by then every indexed
-- nut_free=true row has explicit allergen data.

------------------------------------------------------------------------------
-- 1. New columns on menu_items
------------------------------------------------------------------------------

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS dietary_dairy_free BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dietary_low_carb   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dietary_keto       BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN menu_items.dietary_dairy_free IS
  'Menu Protocol v1.0 dietary flag. Default FALSE; only set TRUE on explicit positive signal.';
COMMENT ON COLUMN menu_items.dietary_low_carb IS
  'Menu Protocol v1.0 dietary flag. Default FALSE; only set TRUE on explicit positive signal.';
COMMENT ON COLUMN menu_items.dietary_keto IS
  'Menu Protocol v1.0 dietary flag. Default FALSE; only set TRUE on explicit positive signal.';

------------------------------------------------------------------------------
-- 2. Backfill: undo unsafe nut_free=TRUE on indexed menus.
--
-- Scope: indexed-tier menus only. We do NOT touch verified menus because
-- owners explicitly signed those payloads; reverting their nut_free claim
-- would invalidate their signature without their consent. For verified
-- restaurants where a re-affirmation is needed, the owner can republish.
------------------------------------------------------------------------------

UPDATE menu_items mi
SET dietary_nut_free = FALSE
FROM menus m
JOIN restaurants r ON r.id = m.restaurant_id
WHERE mi.category_id IN (
        SELECT mc.id FROM menu_categories mc WHERE mc.menu_id = m.id
      )
  AND mi.dietary_nut_free = TRUE
  AND (mi.allergens IS NULL OR cardinality(mi.allergens) = 0)
  AND r.verification_status = 'menu_indexed';

------------------------------------------------------------------------------
-- 3. Verification
------------------------------------------------------------------------------

-- The script that applies this migration should print the row counts:
--   SELECT count(*) FROM menu_items WHERE dietary_dairy_free; -- expect 0 immediately after migration
--   SELECT count(*) FROM menu_items WHERE dietary_low_carb;   -- expect 0
--   SELECT count(*) FROM menu_items WHERE dietary_keto;       -- expect 0
--   SELECT count(*) FROM menu_items mi
--     JOIN menu_categories mc ON mc.id = mi.category_id
--     JOIN menus m ON m.id = mc.menu_id
--     JOIN restaurants r ON r.id = m.restaurant_id
--     WHERE r.verification_status = 'menu_indexed'
--       AND mi.dietary_nut_free = TRUE
--       AND (mi.allergens IS NULL OR cardinality(mi.allergens) = 0);
--   -- expect 0 after the UPDATE above runs
