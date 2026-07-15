-- Consumer near-me usage meter (no PII; city-level only)
CREATE TABLE IF NOT EXISTS near_me_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day DATE NOT NULL DEFAULT (CURRENT_DATE),
  city TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('geo', 'fallback')),
  query TEXT NOT NULL DEFAULT '',
  result_count INTEGER NOT NULL DEFAULT 0,
  ok BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS near_me_usage_day_city_idx
  ON near_me_usage (day, city);
