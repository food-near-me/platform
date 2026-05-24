/**
 * `compare_restaurants_for_diet` MCP composite tool.
 *
 * Compares up to 5 known restaurants on dietary-eligible menu items.
 * v1 intentionally excludes distance fields because restaurant coordinates
 * are not exposed on the public MCP read surface yet.
 */

import {
  buildClaimInvitation,
  type ClaimInvitation,
  tierSortRank,
} from "@/lib/discovery/verification-status";
import { buildCompareCitation, citationFields } from "@/lib/mcp/citations";
import { ResourceNotFoundError } from "@/lib/mcp/errors";
import { fetchRestaurantCoordinates } from "@/lib/restaurants/coordinates";
import { createClient } from "@/lib/supabase/server";

import { getMenu } from "./menu";
import { getRestaurant } from "./restaurant";
import type { CompareRestaurantsForDietInput } from "./inputs";
import { filterItemsByDietary, haversineMeters } from "./composites/shared";

type ComparableTier = "verified" | "menu_indexed" | "discovered" | "not_found";

type ComparableMenuItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  available: boolean;
  preparation_time_minutes?: number | null;
  dietary: Record<string, boolean>;
  allergens: string[];
  customization_options?: unknown;
  popularity_score?: number | null;
  caution?: string;
};

type ComparedRestaurant = {
  id: string;
  name: string;
  tier: ComparableTier;
  menu_available: boolean;
  dietary_eligible_items: ComparableMenuItem[];
  item_count: number;
  distance_meters?: number;
  note?: string;
  claim_invitation?: ClaimInvitation;
};

function sortCompared(a: ComparedRestaurant, b: ComparedRestaurant): number {
  if (a.item_count !== b.item_count) return b.item_count - a.item_count;

  const aRank = a.tier === "not_found" ? 99 : tierSortRank(a.tier);
  const bRank = b.tier === "not_found" ? 99 : tierSortRank(b.tier);
  if (aRank !== bRank) return aRank - bRank;

  // Distance is the final tiebreaker, and only applies when both rows have a
  // computed distance_meters (i.e., user_location was provided AND both
  // restaurants had a non-null PostGIS location). Rows without distance
  // remain in their pre-sort order.
  if (
    typeof a.distance_meters === "number" &&
    typeof b.distance_meters === "number"
  ) {
    return a.distance_meters - b.distance_meters;
  }
  return 0;
}

function summaryNotes(restaurants: ComparedRestaurant[]): string[] {
  const notes: string[] = [];
  if (restaurants.some((r) => r.tier === "verified")) {
    notes.push("Prefer verified-tier matches for authoritative dietary/allergen answers.");
  }
  if (restaurants.some((r) => r.tier === "menu_indexed")) {
    notes.push("menu_indexed items are public-source indexed and may include caution text.");
  }
  if (restaurants.some((r) => r.tier === "discovered")) {
    notes.push("discovered entries return zero menu items by design (no menu signal).");
  }
  return notes;
}

export async function compareRestaurantsForDiet(input: CompareRestaurantsForDietInput) {
  const restaurantIds = [...new Set(input.restaurant_ids)];
  const dietary = input.dietary;
  const userLocation = input.user_location;

  // Resolve coordinates up-front in a single RPC call so we don't pay a
  // round-trip per restaurant. Restaurants with a NULL `location` are
  // simply absent from the map; we surface that as `note: distance_not_available`.
  let coordinates = new Map<string, { lat: number; lng: number }>();
  if (userLocation) {
    const supabase = createClient();
    coordinates = await fetchRestaurantCoordinates(supabase, restaurantIds);
  }

  const computeDistance = (restaurantId: string): number | undefined => {
    if (!userLocation) return undefined;
    const point = coordinates.get(restaurantId);
    if (!point) return undefined;
    return Math.round(
      haversineMeters(
        { lat: userLocation.latitude, lng: userLocation.longitude },
        point,
      ),
    );
  };

  const restaurants: ComparedRestaurant[] = [];

  for (const restaurantId of restaurantIds) {
    try {
      const profile = await getRestaurant({ restaurant_id: restaurantId });
      const tier = profile.verification_status as ComparableTier;
      const menuAvailable = profile.menu_available === true;
      const claimInvitation = buildClaimInvitation(restaurantId, tier, menuAvailable);
      const claimSpread = claimInvitation ? { claim_invitation: claimInvitation } : {};

      const distanceMeters = computeDistance(restaurantId);
      const distanceSpread =
        typeof distanceMeters === "number" ? { distance_meters: distanceMeters } : {};
      const distanceMissingNote =
        userLocation && distanceMeters === undefined
          ? "distance_not_available: restaurant has no geocoded location in our index."
          : undefined;

      const composeNote = (existing?: string): string | undefined => {
        if (existing && distanceMissingNote) return `${existing} ${distanceMissingNote}`;
        return existing ?? distanceMissingNote;
      };

      if (!menuAvailable) {
        restaurants.push({
          id: restaurantId,
          name: profile.name,
          tier,
          menu_available: false,
          dietary_eligible_items: [],
          item_count: 0,
          note: composeNote(
            "No menu signal — only verified or menu_indexed listings with menu_available=true can answer dietary questions.",
          ),
          ...distanceSpread,
          ...claimSpread,
        });
        continue;
      }

      try {
        const menuPayload = await getMenu({ restaurant_id: restaurantId });
        const allItems = menuPayload.menu.items as ComparableMenuItem[];
        const matches = filterItemsByDietary(allItems, dietary);
        const indexedNote =
          tier === "menu_indexed"
            ? "Indexed menu — dietary fields are best-effort and should be cited with caveat."
            : undefined;
        restaurants.push({
          id: restaurantId,
          name: profile.name,
          tier,
          menu_available: true,
          dietary_eligible_items: matches,
          item_count: matches.length,
          ...(composeNote(indexedNote) ? { note: composeNote(indexedNote)! } : {}),
          ...distanceSpread,
          ...claimSpread,
        });
      } catch (menuErr) {
        const failureNote =
          menuErr instanceof Error
            ? `Menu lookup failed for this restaurant: ${menuErr.message}`
            : "Menu lookup failed for this restaurant.";
        restaurants.push({
          id: restaurantId,
          name: profile.name,
          tier,
          menu_available: true,
          dietary_eligible_items: [],
          item_count: 0,
          note: composeNote(failureNote),
          ...distanceSpread,
          ...claimSpread,
        });
      }
    } catch (err) {
      if (err instanceof ResourceNotFoundError) {
        restaurants.push({
          id: restaurantId,
          name: "Unknown restaurant",
          tier: "not_found",
          menu_available: false,
          dietary_eligible_items: [],
          item_count: 0,
          note: "Restaurant id not found. Call search_restaurants and reuse an id from results.",
        });
        continue;
      }
      throw err;
    }
  }

  restaurants.sort(sortCompared);
  const ranking = restaurants.map((r) => ({
    restaurant_id: r.id,
    item_count: r.item_count,
    tier: r.tier,
  }));

  const best = restaurants.find((r) => r.item_count > 0);
  const citation = buildCompareCitation({
    restaurantIds,
    dietary,
  });

  const baseNextSteps = [
    "Call get_menu with any restaurant id for a full menu view.",
    "Run search_restaurants to add more candidates into this comparison.",
  ];
  const distanceUnknownIds = userLocation
    ? restaurants
        .filter((r) => r.tier !== "not_found" && typeof r.distance_meters !== "number")
        .map((r) => r.id)
    : [];
  const distanceNote =
    distanceUnknownIds.length > 0
      ? `Distance not available for ${distanceUnknownIds.length} restaurant(s); their PostGIS location is null.`
      : null;
  const nextSteps = distanceNote
    ? [...baseNextSteps, distanceNote]
    : baseNextSteps;

  return {
    ...citationFields(citation),
    dietary,
    ...(userLocation ? { user_location: userLocation } : {}),
    restaurants,
    comparison_summary: {
      ranking,
      best_match: best ? best.id : null,
      notes: summaryNotes(restaurants),
    },
    next_steps: nextSteps,
  };
}
