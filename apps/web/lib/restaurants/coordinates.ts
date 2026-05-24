/**
 * On-demand restaurant coordinate lookup.
 *
 * Calls the `public.get_restaurant_coordinates(p_ids uuid[])` Postgres
 * function, which extracts `ST_X`/`ST_Y` from the PostGIS `location`
 * column for a specific batch of UUIDs. This is the only path the public
 * MCP read surface uses to expose per-restaurant lat/lng — the `location`
 * column itself is intentionally absent from `RESTAURANT_PROFILE_COLUMNS`
 * because PostgREST cannot serialize the GEOGRAPHY binary cleanly.
 *
 * Usage:
 *   const coords = await fetchRestaurantCoordinates(supabase, ids);
 *   const point = coords.get(restaurantId);
 *   if (point) const meters = haversineMeters(userLatLng, point);
 *
 * Restaurants with a NULL `location` row are silently omitted from the
 * returned map. Callers must handle the absent case (e.g., omit
 * `distance_meters` from the response with an explanatory note).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/server";

export type RestaurantCoordinate = { lat: number; lng: number };

export async function fetchRestaurantCoordinates(
  supabase: SupabaseClient<Database>,
  ids: readonly string[],
): Promise<Map<string, RestaurantCoordinate>> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.rpc("get_restaurant_coordinates", {
    p_ids: unique,
  });

  if (error) {
    throw new Error(`get_restaurant_coordinates failed: ${error.message}`);
  }

  const map = new Map<string, RestaurantCoordinate>();
  for (const row of data ?? []) {
    if (typeof row.latitude !== "number" || typeof row.longitude !== "number") continue;
    map.set(row.id, { lat: row.latitude, lng: row.longitude });
  }
  return map;
}
