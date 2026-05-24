-- public.get_restaurant_coordinates(p_ids uuid[])
--
-- Surface restaurant lat/lng on demand without bloating RESTAURANT_PROFILE_COLUMNS.
--
-- Why a function (not a view, not an extra column on `restaurants`):
--   * `restaurants.location` is PostGIS GEOGRAPHY(POINT, 4326) — opaque to
--     PostgREST clients. The MCP tools and composites that need distance
--     (e.g. `compare_restaurants_for_diet` v2, future "closest verified vegan
--     spot to a UUID list" composites) only need lat/lng for a small,
--     caller-known set of ids, not on every search row.
--   * A SQL function called via `supabase.rpc()` lets us extract `ST_X` and
--     `ST_Y` for a specific UUID batch without touching the public
--     `restaurants` projection or paying the cost for the 164k discovered
--     places that get returned in unrelated search responses.
--
-- Stable and security-invoker (default) — read-only against the public table.
--
-- Apply with: npm run db:migrate:get-restaurant-coordinates

create or replace function public.get_restaurant_coordinates(p_ids uuid[])
returns table(id uuid, latitude double precision, longitude double precision)
language sql
stable
as $$
  select
    r.id,
    st_y(r.location::geometry)::float8 as latitude,
    st_x(r.location::geometry)::float8 as longitude
  from public.restaurants r
  where r.id = any(p_ids)
    and r.location is not null;
$$;

comment on function public.get_restaurant_coordinates(uuid[]) is
  'Returns id + latitude + longitude for restaurants with a non-null PostGIS location. Used by MCP composites that need on-demand distance computation (see lib/mcp/tools/COMPOSITES.md Tool 1 v2).';
