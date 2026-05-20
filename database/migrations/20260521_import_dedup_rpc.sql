-- M3: PostGIS-backed spatial dedup for discovered imports
-- Run via: npm run db:migrate:import-dedup (or Supabase SQL Editor)

CREATE OR REPLACE FUNCTION find_nearby_for_import(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radius_meters DOUBLE PRECISION DEFAULT 80
) RETURNS TABLE (
    id UUID,
    name TEXT,
    verification_status TEXT,
    source TEXT,
    source_record_id TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION
) LANGUAGE sql STABLE AS $$
    SELECT
        r.id,
        r.name,
        r.verification_status,
        r.source,
        r.source_record_id,
        ST_Y(r.location::geometry) AS lat,
        ST_X(r.location::geometry) AS lng
    FROM restaurants r
    WHERE ST_DWithin(
        r.location,
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        p_radius_meters
    );
$$;

-- M4: import run observability
CREATE TABLE IF NOT EXISTS import_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_key TEXT NOT NULL,
    sources TEXT[] NOT NULL DEFAULT '{}',
    dry_run BOOLEAN NOT NULL DEFAULT false,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    inserted INT NOT NULL DEFAULT 0,
    skipped INT NOT NULL DEFAULT 0,
    enriched INT NOT NULL DEFAULT 0,
    protected INT NOT NULL DEFAULT 0,
    error TEXT
);

CREATE INDEX IF NOT EXISTS import_runs_region_started_idx
    ON import_runs (region_key, started_at DESC);
