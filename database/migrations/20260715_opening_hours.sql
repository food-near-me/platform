-- Opening hours for consumer near-me (OSM opening_hours tag)
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS opening_hours TEXT;

COMMENT ON COLUMN restaurants.opening_hours IS
  'Raw OSM opening_hours string when known. Never invent; display/parse only.';
