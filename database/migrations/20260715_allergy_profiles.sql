-- Curated consumer allergy profiles (not owner-verified dietary_certifications).
-- Never invent safety from OSM; only human-curated notes with an explicit mechanism.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS allergy_needs TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allergy_safety_tier TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS allergy_safety_note TEXT,
  ADD COLUMN IF NOT EXISTS allergy_updated_at TIMESTAMPTZ;

ALTER TABLE restaurants
  DROP CONSTRAINT IF EXISTS restaurants_allergy_safety_tier_check;

ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_allergy_safety_tier_check
  CHECK (allergy_safety_tier IN ('dedicated', 'strong_protocol', 'shared_verify', 'unknown'));

CREATE INDEX IF NOT EXISTS restaurants_allergy_needs_gin
  ON restaurants USING GIN (allergy_needs);

COMMENT ON COLUMN restaurants.allergy_needs IS
  'Consumer filter keys e.g. gluten_free, dairy_free, nut_aware, vegetarian. Curated only.';
COMMENT ON COLUMN restaurants.allergy_safety_tier IS
  'dedicated | strong_protocol | shared_verify | unknown — mechanism strength, not a medical claim.';
COMMENT ON COLUMN restaurants.allergy_safety_note IS
  'Human why/caveat. Required for tiers other than unknown. Always verify with restaurant.';
