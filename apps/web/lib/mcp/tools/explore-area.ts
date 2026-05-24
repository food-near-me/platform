/**
 * `explore_area_for_diet` MCP composite tool.
 *
 * Decorates `searchRestaurants` with explicit three-tier bucketing so an
 * agent can present "verified picks", "indexed candidates", and "place-only
 * listings" side by side. Pure composite: every database round-trip happens
 * inside the wrapped `searchRestaurants` call.
 *
 * Design contract: `lib/mcp/tools/COMPOSITES.md` § Tool 3.
 */

import {
  buildClaimInvitation,
  type ClaimInvitation,
} from "@/lib/discovery/verification-status";
import { buildExploreCitation, citationFields } from "@/lib/mcp/citations";
import { MAX_SEARCH_RADIUS_MILES } from "@/lib/mcp/constants";

import type { ExploreAreaForDietInput } from "./inputs";
import { searchRestaurants } from "./search";

const DEFAULT_RADIUS_METERS = 1000;
const DEFAULT_TOP_N_PER_TIER = 3;
const MAX_SEARCH_RADIUS_METERS = MAX_SEARCH_RADIUS_MILES * 1609.34;

type SearchResultLike = Awaited<ReturnType<typeof searchRestaurants>>["results"][number];

type ExploreEntry = {
  id: string;
  name: string;
  slug: string;
  tier: string;
  distance_meters: number;
  agent_score: SearchResultLike["agent_score"];
  cuisine_type: SearchResultLike["cuisine_type"];
  menu_available: boolean;
  data_source: SearchResultLike["data_source"];
  trust_notice: string;
  links: SearchResultLike["links"];
  claim_invitation?: ClaimInvitation;
};

function toExploreEntry(r: SearchResultLike): ExploreEntry {
  const claimInvitation = buildClaimInvitation(
    r.id,
    r.verification_status,
    r.menu_available,
  );
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    tier: r.verification_status,
    distance_meters: r.distance_meters,
    agent_score: r.agent_score,
    cuisine_type: r.cuisine_type,
    menu_available: r.menu_available,
    data_source: r.data_source,
    trust_notice: r.trust_notice,
    links: r.links,
    ...(claimInvitation ? { claim_invitation: claimInvitation } : {}),
  };
}

export async function exploreAreaForDiet(input: ExploreAreaForDietInput) {
  const { location, dietary, radius_meters, top_n_per_tier } = input;
  const dietaryFilters = dietary ?? [];
  const topN = top_n_per_tier ?? DEFAULT_TOP_N_PER_TIER;
  const clampedRadiusMeters = Math.min(
    radius_meters ?? DEFAULT_RADIUS_METERS,
    MAX_SEARCH_RADIUS_METERS,
  );
  const radiusMiles = clampedRadiusMeters / 1609.34;

  const search = await searchRestaurants({
    query: "",
    lat: location.latitude,
    lng: location.longitude,
    radius_miles: radiusMiles,
    dietary: dietaryFilters.length > 0 ? dietaryFilters : undefined,
    min_ado_score: undefined,
    languageCode: undefined,
    regionCode: undefined,
  });

  const allResults = search.results;

  const verified: ExploreEntry[] = [];
  const menuIndexed: ExploreEntry[] = [];
  const discovered: ExploreEntry[] = [];

  for (const r of allResults) {
    const entry = toExploreEntry(r);
    if (r.verification_status === "verified") verified.push(entry);
    else if (r.verification_status === "menu_indexed") menuIndexed.push(entry);
    else if (r.verification_status === "discovered") discovered.push(entry);
  }

  const tierCounts = {
    verified: verified.length,
    menu_indexed: menuIndexed.length,
    discovered: discovered.length,
    total: verified.length + menuIndexed.length + discovered.length,
  };

  const trimmedTiers = {
    verified: verified.slice(0, topN),
    menu_indexed: menuIndexed.slice(0, topN),
    discovered: discovered.slice(0, topN),
  };

  const nextSteps: string[] = [];
  if (tierCounts.total === 0) {
    nextSteps.push(
      `No restaurants found within ${Math.round(clampedRadiusMeters)} m. Try a larger radius_meters or a different location.`,
    );
    if (dietaryFilters.length > 0) {
      nextSteps.push(
        `Dietary filters (${dietaryFilters.join(", ")}) only narrow the verified tier; drop them to surface menu_indexed and discovered listings.`,
      );
    }
  } else {
    if (tierCounts.verified === 0 && dietaryFilters.length > 0) {
      nextSteps.push(
        `No verified-tier matches for dietary=[${dietaryFilters.join(", ")}]. Dietary filters only narrow the verified tier — drop them to see menu_indexed and discovered candidates.`,
      );
    } else if (tierCounts.verified === 0) {
      nextSteps.push(
        "No verified-tier matches in this area. menu_indexed and discovered listings are returned with weaker trust labels.",
      );
    }
    if (tierCounts.menu_indexed === 0) {
      nextSteps.push(
        "No menu_indexed matches. menu_indexed coverage is currently strongest in Williamsburg, NYC.",
      );
    }
    if (tierCounts.discovered === 0) {
      nextSteps.push("No discovered listings in this area.");
    }
    nextSteps.push(
      "Use search_restaurants directly for paginated results beyond top_n_per_tier per bucket.",
    );
  }

  const citation = buildExploreCitation({
    lat: location.latitude,
    lng: location.longitude,
    radiusMeters: Math.round(clampedRadiusMeters),
    dietary: dietaryFilters,
    topNPerTier: topN,
  });

  return {
    ...citationFields(citation),
    location: { latitude: location.latitude, longitude: location.longitude },
    radius_meters: Math.round(clampedRadiusMeters),
    ...(dietaryFilters.length > 0 ? { dietary: dietaryFilters } : {}),
    top_n_per_tier: topN,
    tiers: trimmedTiers,
    tier_counts: tierCounts,
    ...(nextSteps.length > 0 ? { next_steps: nextSteps } : {}),
  };
}
