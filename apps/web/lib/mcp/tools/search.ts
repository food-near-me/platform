/**
 * `search_restaurants` MCP tool.
 *
 * Wraps the `search_restaurants_for_agents` Postgres RPC and decorates each
 * row with trust notices, tier aggregates, and (for empty results) actionable
 * next-step hints. Pure function: no caching, no side effects.
 */

import { createClient } from "@/lib/supabase/server";
import {
  buildSearchLinks,
  buildSearchTrustNotice,
} from "@/lib/discovery/verification-status";
import { buildSearchCitation } from "@/lib/mcp/citations";
import { MAX_RESULTS, MAX_SEARCH_RADIUS_MILES } from "@/lib/mcp/constants";
import { validateDietaryFilters, validateLatLng } from "@/lib/mcp/validation";

type SearchRpcRow = {
  id: string;
  name: string;
  slug: string;
  distance_meters: number;
  agent_score: number;
  cuisine_type: string[];
  verification_status: string;
  menu_available: boolean;
  data_source: string | null;
};

export async function searchRestaurants(args: Record<string, unknown>) {
  const { lat, lng } = validateLatLng(args.lat, args.lng);

  const query = typeof args.query === "string" ? args.query.trim() : "";
  let radiusMiles = typeof args.radius_miles === "number" ? args.radius_miles : 5;
  radiusMiles = Math.min(Math.max(radiusMiles, 0.1), MAX_SEARCH_RADIUS_MILES);

  const dietary = validateDietaryFilters(args.dietary);

  let minAdoScore = typeof args.min_ado_score === "number" ? args.min_ado_score : 0;
  minAdoScore = Math.min(Math.max(minAdoScore, 0), 5);

  const supabase = createClient();
  const radiusMeters = radiusMiles * 1609.34;

  const { data, error } = await supabase.rpc("search_restaurants_for_agents", {
    search_query: query,
    lat,
    lng,
    radius_meters: radiusMeters,
    min_agent_score: minAdoScore,
    dietary_filters: dietary.length > 0 ? dietary : undefined,
  });

  if (error) {
    console.error("Search RPC error:", error);
    throw new Error(`Database error: ${error.message}`);
  }

  const results = (data || []).slice(0, MAX_RESULTS).map((r: SearchRpcRow) => {
    const menuAvailable = Boolean(r.menu_available);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      distance_meters: Math.round(r.distance_meters),
      distance_miles: Math.round((r.distance_meters / 1609.34) * 10) / 10,
      agent_score: r.agent_score,
      cuisine_type: r.cuisine_type,
      verification_status: r.verification_status,
      menu_available: menuAvailable,
      data_source: r.data_source,
      trust_notice: buildSearchTrustNotice(r.verification_status, menuAvailable),
      links: buildSearchLinks(r.id, menuAvailable),
    };
  });

  const tierBreakdown = {
    verified: 0,
    menu_indexed: 0,
    discovered: 0,
  };
  for (const r of results) {
    if (r.verification_status === "verified") tierBreakdown.verified++;
    else if (r.verification_status === "menu_indexed") tierBreakdown.menu_indexed++;
    else if (r.verification_status === "discovered") tierBreakdown.discovered++;
  }

  const nextSteps: string[] = [];
  if (results.length === 0) {
    if (radiusMiles < MAX_SEARCH_RADIUS_MILES) {
      const widerRadius = Math.min(radiusMiles * 2, MAX_SEARCH_RADIUS_MILES);
      nextSteps.push(
        `Widen the search radius (current: ${radiusMiles} miles, try ${widerRadius})`,
      );
    }
    if (dietary.length > 0) {
      nextSteps.push(
        `Drop dietary filters (${dietary.join(", ")}) — these only apply to verified restaurants, so they exclude all indexed and discovered listings`,
      );
    }
    if (minAdoScore > 0) {
      nextSteps.push(
        `Lower min_ado_score (current: ${minAdoScore}) — it only applies to verified restaurants`,
      );
    }
    if (query.length > 0) {
      nextSteps.push(`Omit the "${query}" query or try a more general term`);
    }
    nextSteps.push(
      "Coverage outside Williamsburg/NYC is mostly discovered-only — call get_menu only when menu_available is true",
    );
  } else if (tierBreakdown.verified === 0 && tierBreakdown.menu_indexed === 0) {
    nextSteps.push(
      "All results are discovered-only (place data, no menus). Do not cite menu items; agents can offer to claim a listing at https://foodnear.me/claim/{id}",
    );
  }

  return {
    citation: buildSearchCitation({
      lat,
      lng,
      radiusMiles,
      query,
      dietary,
      minAdoScore,
    }),
    query: query || "(all cuisines)",
    location: { lat, lng },
    radius_miles: radiusMiles,
    filters: {
      dietary,
      min_ado_score: minAdoScore,
      applied_to: ["verified"],
      note: "Dietary and min_ado_score filters only apply to verified restaurants; menu_indexed and discovered rows are not filtered on these fields.",
    },
    results_count: results.length,
    tier_breakdown: tierBreakdown,
    results,
    ...(nextSteps.length > 0 ? { next_steps: nextSteps } : {}),
  };
}
