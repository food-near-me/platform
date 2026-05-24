/**
 * `find_restaurants_along_route` MCP composite tool.
 *
 * Finds restaurants near sampled route waypoints and ranks them by
 * dietary match count (when requested), trust tier, and route proximity.
 */

import {
  buildClaimInvitation,
  type ClaimInvitation,
  tierSortRank,
} from "@/lib/discovery/verification-status";
import { buildAlongRouteCitation, citationFields } from "@/lib/mcp/citations";
import { ValidationError } from "@/lib/mcp/errors";

import type { FindRestaurantsAlongRouteInput } from "./inputs";
import { getMenu } from "./menu";
import { searchRestaurants } from "./search";
import { decodePolyline } from "./composites/polyline";
import { filterItemsByDietary, haversineMeters, sampleGreatCircle } from "./composites/shared";

const DEFAULT_MAX_RESULTS = 5;
const MAX_ROUTE_DISTANCE_METERS = 200000;
const MIN_ROUTE_DISTANCE_METERS = 100;
const WAYPOINT_RADIUS_MILES = 0.5;

type SearchResultLike = Awaited<ReturnType<typeof searchRestaurants>>["results"][number];

type RouteCandidate = {
  restaurant_id: string;
  name: string;
  tier: "verified" | "menu_indexed" | "discovered";
  menu_available: boolean;
  trust_notice: string;
  route_proximity_meters: number;
  dietary_match_count: number;
};

function compareCandidates(a: RouteCandidate, b: RouteCandidate, withDietary: boolean): number {
  if (withDietary && a.dietary_match_count !== b.dietary_match_count) {
    return b.dietary_match_count - a.dietary_match_count;
  }
  if (a.tier !== b.tier) return tierSortRank(a.tier) - tierSortRank(b.tier);
  return a.route_proximity_meters - b.route_proximity_meters;
}

export async function findRestaurantsAlongRoute(input: FindRestaurantsAlongRouteInput) {
  const maxResults = input.max_results ?? DEFAULT_MAX_RESULTS;
  const dietary = input.dietary ?? [];

  const origin = { lat: input.origin.latitude, lng: input.origin.longitude };
  const destination = { lat: input.destination.latitude, lng: input.destination.longitude };
  const directDistance = haversineMeters(origin, destination);

  if (directDistance < MIN_ROUTE_DISTANCE_METERS) {
    throw new ValidationError(
      "origin and destination are too close (<100m)",
      "Provide route endpoints at least 100 meters apart.",
    );
  }
  if (directDistance > MAX_ROUTE_DISTANCE_METERS) {
    throw new ValidationError(
      "route exceeds supported 200 km cap",
      "Split into shorter segments and call this tool per segment.",
    );
  }

  let routeMethod = "great_circle_approximation";
  let waypoints: Array<{ lat: number; lng: number }> = sampleGreatCircle(origin, destination, 5);
  if (input.route_polyline) {
    try {
      waypoints = decodePolyline(input.route_polyline);
      routeMethod = "agent_supplied_polyline";
    } catch {
      routeMethod = "great_circle_approximation_after_polyline_failed";
    }
  }

  const merged = new Map<string, RouteCandidate>();

  for (const waypoint of waypoints) {
    const search = await searchRestaurants({
      query: "",
      lat: waypoint.lat,
      lng: waypoint.lng,
      radius_miles: WAYPOINT_RADIUS_MILES,
      dietary: undefined,
      min_ado_score: undefined,
      languageCode: undefined,
      regionCode: undefined,
    });

    const rows = search.results as SearchResultLike[];
    for (const row of rows) {
      const tier = row.verification_status as RouteCandidate["tier"];
      const proximity = row.distance_meters;
      const existing = merged.get(row.id);
      if (!existing) {
        merged.set(row.id, {
          restaurant_id: row.id,
          name: row.name,
          tier,
          menu_available: row.menu_available,
          trust_notice: row.trust_notice,
          route_proximity_meters: proximity,
          dietary_match_count: 0,
        });
        continue;
      }
      if (proximity < existing.route_proximity_meters) {
        existing.route_proximity_meters = proximity;
      }
      // Trust tier should only improve, never regress.
      if (tierSortRank(tier) < tierSortRank(existing.tier)) {
        existing.tier = tier;
      }
      existing.menu_available = existing.menu_available || row.menu_available;
    }
  }

  const candidates = Array.from(merged.values());

  if (dietary.length > 0) {
    for (const candidate of candidates) {
      if (!candidate.menu_available) continue;
      if (candidate.tier === "discovered") continue;
      try {
        const menu = await getMenu({ restaurant_id: candidate.restaurant_id });
        const items = menu.menu.items as Array<{ dietary?: Record<string, boolean> }>;
        candidate.dietary_match_count = filterItemsByDietary(items, dietary).length;
      } catch {
        candidate.dietary_match_count = 0;
      }
    }
  }

  candidates.sort((a, b) => compareCandidates(a, b, dietary.length > 0));
  const places = candidates.slice(0, maxResults).map((c) => {
    const claimInvitation = buildClaimInvitation(c.restaurant_id, c.tier, c.menu_available);
    return {
      restaurant_id: c.restaurant_id,
      name: c.name,
      tier: c.tier as string,
      route_proximity_meters: Math.round(c.route_proximity_meters),
      menu_available: c.menu_available,
      trust_notice: c.trust_notice,
      ...(dietary.length > 0 ? { dietary_match_count: c.dietary_match_count } : {}),
      ...(claimInvitation ? { claim_invitation: claimInvitation } : {}),
    } as {
      restaurant_id: string;
      name: string;
      tier: string;
      route_proximity_meters: number;
      menu_available: boolean;
      trust_notice: string;
      dietary_match_count?: number;
      claim_invitation?: ClaimInvitation;
    };
  });

  const tierBreakdown = { verified: 0, menu_indexed: 0, discovered: 0 };
  for (const row of places) {
    if (row.tier === "verified") tierBreakdown.verified++;
    else if (row.tier === "menu_indexed") tierBreakdown.menu_indexed++;
    else if (row.tier === "discovered") tierBreakdown.discovered++;
  }

  const nextSteps: string[] = [];
  if (places.length === 0) {
    nextSteps.push(
      "No route-adjacent matches found. Try a different corridor or call search_restaurants around your destination.",
    );
  }
  if (routeMethod !== "agent_supplied_polyline") {
    nextSteps.push(
      "Provide route_polyline from your routing source for tighter route proximity ranking.",
    );
  }
  if (dietary.length > 0 && places.every((p) => (p.dietary_match_count ?? 0) === 0)) {
    nextSteps.push(
      "No dietary item matches found in current candidates. Remove dietary filters to inspect baseline options.",
    );
  }

  const citation = buildAlongRouteCitation({
    origin: input.origin,
    destination: input.destination,
    dietary,
    maxResults,
    routeMethod,
  });

  return {
    ...citationFields(citation),
    origin: input.origin,
    destination: input.destination,
    direct_distance_meters: Math.round(directDistance),
    route_method: routeMethod,
    ...(dietary.length > 0 ? { dietary } : {}),
    max_results: maxResults,
    places,
    tier_breakdown: tierBreakdown,
    ...(nextSteps.length > 0 ? { next_steps: nextSteps } : {}),
  };
}
