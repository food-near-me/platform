-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Restaurants Table
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    
    -- Geospatial location (Longitude, Latitude)
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    address TEXT,
    delivery_radius_miles NUMERIC DEFAULT 5.0,
    
    cuisine_type TEXT[] DEFAULT '{}',
    price_range INTEGER CHECK (price_range >= 1 AND price_range <= 4),
    
    agent_score NUMERIC(3,2) DEFAULT 0.0 CHECK (agent_score >= 0 AND agent_score <= 5.0),
    verification_status TEXT DEFAULT 'discovered' CHECK (verification_status IN ('discovered', 'menu_indexed', 'verified')),
    
    payment_methods TEXT[] DEFAULT '{}',
    dietary_certifications TEXT[] DEFAULT '{}',
    
    -- Provenance (discovered layer imports)
    source TEXT,
    source_record_id TEXT,
    import_confidence NUMERIC(3,2) DEFAULT 0.5 CHECK (import_confidence >= 0 AND import_confidence <= 1),
    discovered_at TIMESTAMPTZ,
    last_external_update TIMESTAMPTZ,
    website_url TEXT,
    phone TEXT,
    health_inspection_grade TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Full-text search column (populated by trigger)
    fts tsvector
);

-- Indexes for fast geospatial and text search
CREATE INDEX restaurants_location_idx ON restaurants USING GIST (location);
CREATE INDEX restaurants_fts_idx ON restaurants USING GIN (fts);

-- Trigger to update FTS on restaurants
CREATE OR REPLACE FUNCTION restaurants_fts_trigger() RETURNS trigger AS $$
BEGIN
    NEW.fts := 
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(array_to_string(NEW.cuisine_type, ' '), '')), 'B') ||
        setweight(to_tsvector('english', coalesce(NEW.address, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER restaurants_fts_update
    BEFORE INSERT OR UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION restaurants_fts_trigger();

-- 2. Menus Table (Tracks the overall menu state and cryptographic approval)
CREATE TABLE menus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    protocol_version TEXT DEFAULT '1.0',
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'published')),
    
    -- Cryptographic Liability Fields
    signature_hash TEXT,
    signature_signer TEXT,
    signature_timestamp TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Menu Categories
CREATE TABLE menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id UUID REFERENCES menus(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Menu Items
CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES menu_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    
    price NUMERIC(10,2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    available BOOLEAN DEFAULT TRUE,
    preparation_time_minutes INTEGER,
    
    -- Dietary & Allergens explicitly typed for agent parsing
    dietary_vegetarian BOOLEAN DEFAULT FALSE,
    dietary_vegan BOOLEAN DEFAULT FALSE,
    dietary_gluten_free BOOLEAN DEFAULT FALSE,
    dietary_halal BOOLEAN DEFAULT FALSE,
    dietary_kosher BOOLEAN DEFAULT FALSE,
    dietary_nut_free BOOLEAN DEFAULT FALSE,
    
    allergens TEXT[] DEFAULT '{}',
    
    -- JSONB for flexible customization options (e.g., add-ons, crust types)
    customization_options JSONB DEFAULT '[]'::jsonb,
    
    popularity_score NUMERIC(3,2) DEFAULT 0.0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Full-text search column (populated by trigger)
    fts tsvector
);

CREATE INDEX menu_items_fts_idx ON menu_items USING GIN (fts);

-- Trigger to update FTS on menu_items
CREATE OR REPLACE FUNCTION menu_items_fts_trigger() RETURNS trigger AS $$
BEGIN
    NEW.fts := 
        setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER menu_items_fts_update
    BEFORE INSERT OR UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION menu_items_fts_trigger();

-- 5. RPC Function for Agent Search (Combines FTS and PostGIS Radius)
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
