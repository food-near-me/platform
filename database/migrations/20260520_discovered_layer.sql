-- Discovered layer: provenance fields + two-tier agent search
-- Run via: npm run db:migrate:discovered-layer

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS import_confidence NUMERIC(3,2) DEFAULT 0.5
    CHECK (import_confidence >= 0 AND import_confidence <= 1),
  ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_external_update TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS health_inspection_grade TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_source_record_uidx
  ON restaurants (source, source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS restaurants_verification_status_idx
  ON restaurants (verification_status);

-- Replace agent search: verified first, then discovered; never menu_indexed in public search
DROP FUNCTION IF EXISTS search_restaurants_for_agents(
  TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC, TEXT[]
);

CREATE OR REPLACE FUNCTION search_restaurants_for_agents(
    search_query TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION,
    min_agent_score NUMERIC DEFAULT 0.0,
    dietary_filters TEXT[] DEFAULT '{}'
) RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    distance_meters DOUBLE PRECISION,
    agent_score NUMERIC,
    cuisine_type TEXT[],
    verification_status TEXT,
    menu_available BOOLEAN,
    data_source TEXT
) LANGUAGE plpgsql AS $$
DECLARE
    search_point GEOGRAPHY := ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.name,
        r.slug,
        ST_Distance(r.location, search_point) AS distance_meters,
        r.agent_score,
        r.cuisine_type,
        r.verification_status,
        EXISTS (
            SELECT 1 FROM menus m
            WHERE m.restaurant_id = r.id
              AND m.status = 'published'
              AND r.verification_status = 'verified'
        ) AS menu_available,
        r.source AS data_source
    FROM restaurants r
    WHERE
        ST_DWithin(r.location, search_point, radius_meters)
        AND (search_query = '' OR r.fts @@ plainto_tsquery('english', search_query))
        AND (
            r.verification_status = 'discovered'
            OR (
                r.verification_status = 'verified'
                AND r.agent_score >= min_agent_score
                AND (
                    array_length(dietary_filters, 1) IS NULL
                    OR r.dietary_certifications @> dietary_filters
                )
            )
        )
    ORDER BY
        CASE r.verification_status WHEN 'verified' THEN 0 ELSE 1 END,
        (r.agent_score * 10)
        + (CASE WHEN search_query = '' THEN 0 ELSE ts_rank(r.fts, plainto_tsquery('english', search_query)) * 20 END)
        - (ST_Distance(r.location, search_point) / 1000) DESC
    LIMIT 50;
END;
$$;
