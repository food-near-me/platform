/**
 * `get_ado_score_breakdown` MCP tool.
 *
 * Returns a per-restaurant ADO (Agent Discovery Optimization) breakdown.
 *
 * IMPORTANT: only `total_score` reflects the live `agent_score` column. The
 * `breakdown` sub-scores are `heuristic_v1` estimates derived from the
 * presence/absence of fields on the restaurant row; the response exposes
 * this via `scoring_info.scoring_method` and `scoring_info.caveat` so
 * agents do not treat the sub-scores as ground truth.
 */

import { createClient } from "@/lib/supabase/server";
import { buildAdoCitation } from "@/lib/mcp/citations";
import { ResourceNotFoundError } from "@/lib/mcp/errors";
import {
  RESTAURANT_FOR_ADO_COLUMNS,
  type RestaurantForAdoRow,
} from "@/lib/supabase/columns";
import type { GetAdoScoreBreakdownInput } from "./inputs";

export async function getAdoScoreBreakdown(input: GetAdoScoreBreakdownInput) {
  const { restaurant_id: restaurantId } = input;
  const supabase = createClient();

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select(RESTAURANT_FOR_ADO_COLUMNS)
    .eq("id", restaurantId)
    .returns<RestaurantForAdoRow[]>()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new ResourceNotFoundError(
        `Restaurant ${restaurantId} not found`,
        "Call search_restaurants first, then use an id from results.",
      );
    }
    throw new Error(`Database error: ${error.message}`);
  }

  const hasVerification = restaurant.verification_status === "verified";
  const hasIndexedMenu = restaurant.verification_status === "menu_indexed";
  const hasCuisine = (restaurant.cuisine_type || []).length > 0;
  const hasDietary = (restaurant.dietary_certifications || []).length > 0;

  const breakdown = {
    menu_completeness: {
      weight: 0.25,
      score: hasCuisine ? 4.5 : 3.0,
      note: hasCuisine ? "Cuisine types defined" : "Missing cuisine information",
    },
    location_accuracy: {
      weight: 0.2,
      score: 5.0,
      note: "Location coordinates provided",
    },
    data_freshness: {
      weight: 0.2,
      score: 4.0,
      note: `Last updated: ${restaurant.updated_at}`,
    },
    protocol_compliance: {
      weight: 0.15,
      score: hasVerification ? 5.0 : hasIndexedMenu ? 3.5 : 2.0,
      note: hasVerification
        ? "Full Menu Protocol v1.0 compliance"
        : hasIndexedMenu
          ? "Indexed MP menu — not owner-verified"
          : "Pending verification",
    },
    verification_status: {
      weight: 0.1,
      score: hasVerification ? 5.0 : hasIndexedMenu ? 2.5 : 0.0,
      note: hasVerification
        ? "Owner-verified"
        : hasIndexedMenu
          ? "Menu indexed from public sources"
          : "Discovered place only",
    },
    media_context: {
      weight: 0.1,
      score: hasDietary ? 4.0 : 2.5,
      note: hasDietary ? "Dietary certifications provided" : "Limited dietary information",
    },
  };

  const recommendations: string[] = [];
  if (!hasVerification) {
    recommendations.push(
      hasIndexedMenu
        ? "Complete owner verification to upgrade from indexed to authoritative menu"
        : "Complete owner verification to unlock full features",
    );
  }
  if (!hasCuisine) recommendations.push("Add cuisine type tags for better search matching");
  if (!hasDietary)
    recommendations.push("Add dietary certifications (vegan_options, gluten_free_options, etc.)");
  recommendations.push("Keep menu data updated weekly for optimal freshness score");
  recommendations.push("Add high-quality images for menu items");

  return {
    citation: buildAdoCitation(restaurantId),
    restaurant_id: restaurantId,
    restaurant_name: restaurant.name,
    total_score: restaurant.agent_score,
    max_score: 5.0,
    breakdown,
    recommendations: recommendations.slice(0, 5),
    next_steps: [
      hasVerification
        ? "Keep menu data fresh (update weekly) to maintain freshness score"
        : `Claim this restaurant at https://foodnear.me/claim/${restaurantId} to unlock verified-tier scoring`,
      "Submit a Menu Protocol payload through validate_menu_protocol before publishing",
      "Add cuisine type tags and dietary certifications to improve match quality",
    ],
    scoring_info: {
      description:
        "ADO (Agent Discovery Optimization) score measures how well a restaurant's data is structured for AI agent consumption",
      factors:
        "Menu completeness, location accuracy, data freshness, protocol compliance, verification status, media context",
      scoring_method: "heuristic_v1",
      caveat:
        "Sub-scores in `breakdown` are heuristic estimates derived from presence/absence of fields. Only `total_score` reflects the live `agent_score` column on the restaurants table. Cache invalidates when `scoring_method` changes.",
    },
  };
}
