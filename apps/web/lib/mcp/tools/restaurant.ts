/**
 * `get_restaurant` MCP tool.
 *
 * Returns a Schema.org/Restaurant JSON-LD-flavored profile augmented with
 * Menu Protocol metadata (verification status, ADO score, trust notice,
 * menu availability). Reads happen through the anon Supabase client; RLS
 * keeps the response surface to the public columns.
 */

import { createClient } from "@/lib/supabase/server";
import {
  buildProfileTrustNotice,
  hasMenuAccess,
} from "@/lib/discovery/verification-status";
import { buildRestaurantCitation } from "@/lib/mcp/citations";
import { ResourceNotFoundError } from "@/lib/mcp/errors";
import type { GetRestaurantInput } from "./inputs";

const PRICE_RANGE_MAP: Record<number, string> = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };

export async function getRestaurant(input: GetRestaurantInput) {
  const { restaurant_id: restaurantId } = input;
  const supabase = createClient();

  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .in("verification_status", ["discovered", "verified", "menu_indexed"])
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
  if (!data) {
    throw new ResourceNotFoundError(
      `Restaurant ${restaurantId} not found`,
      "Call search_restaurants first, then use an id from results.",
    );
  }

  const menuTier = hasMenuAccess(data.verification_status);

  const { data: publishedMenu } = menuTier
    ? await supabase
        .from("menus")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("status", "published")
        .maybeSingle()
    : { data: null };

  const menuAvailable = menuTier && Boolean(publishedMenu);

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    citation: buildRestaurantCitation(data.id),
    id: data.id,
    name: data.name,
    slug: data.slug,
    address: data.address,
    servesCuisine: data.cuisine_type,
    priceRange: data.price_range ? PRICE_RANGE_MAP[data.price_range] : null,
    agent_score: data.agent_score,
    verification_status: data.verification_status,
    menu_available: menuAvailable,
    data_source: data.source ?? null,
    trust_notice: buildProfileTrustNotice(data.verification_status, menuAvailable),
    delivery_radius_miles: data.delivery_radius_miles,
    payment_methods: data.payment_methods || [],
    dietary_certifications: data.dietary_certifications || [],
    website_url: data.website_url ?? null,
    phone: data.phone ?? null,
    health_inspection_grade: data.health_inspection_grade ?? null,
    last_updated: data.updated_at ?? null,
    links: {
      ...(menuAvailable
        ? {
            menu: `https://foodnear.me/api/v1/restaurant/${data.id}/menu.mp`,
            mcp_menu: `Use get_menu tool with restaurant_id: "${data.id}"`,
          }
        : { claim: `https://foodnear.me/claim/${data.id}` }),
    },
  };
}
