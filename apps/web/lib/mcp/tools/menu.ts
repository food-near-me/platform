/**
 * `get_menu` MCP tool.
 *
 * Returns a full Menu Protocol v1.0 payload for the published menu of a
 * verified or menu-indexed restaurant. The response includes a top-level
 * `trust_notice`, an item-level `caution` for indexed-tier rows (allergens
 * are not safe to cite for indexed menus), and a `signature` block that
 * either advertises the active Ed25519 signature + verification URL or
 * explains why no signature is present.
 *
 * TODO(Phase 4): collapse the 4-query restaurant + menu + categories + items
 * chain into a single nested PostgREST select or a Postgres RPC.
 */

import { createClient } from "@/lib/supabase/server";
import { buildMenuTrustNotice } from "@/lib/discovery/verification-status";
import { buildMenuCitation, buildSigningKeysCitation } from "@/lib/mcp/citations";
import { ResourceNotFoundError } from "@/lib/mcp/errors";
import type { GetMenuInput } from "./inputs";

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
};

type ItemRow = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  available: boolean;
  preparation_time_minutes: number | null;
  dietary_vegetarian: boolean;
  dietary_vegan: boolean;
  dietary_gluten_free: boolean;
  dietary_halal: boolean;
  dietary_kosher: boolean;
  dietary_nut_free: boolean;
  allergens: string[];
  customization_options: unknown;
  popularity_score: number;
};

export async function getMenu(input: GetMenuInput) {
  const { restaurant_id: restaurantId } = input;
  const supabase = createClient();

  const { data: restaurant, error: rErr } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .in("verification_status", ["verified", "menu_indexed"])
    .single();

  if (rErr?.code === "PGRST116" || !restaurant) {
    throw new ResourceNotFoundError(
      `Restaurant ${restaurantId} not found or has no accessible menu tier`,
      "Use search_restaurants and call get_menu only when menu_available is true.",
    );
  }

  const { data: menu, error: mErr } = await supabase
    .from("menus")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("status", "published")
    .single();

  if (mErr?.code === "PGRST116" || !menu) {
    throw new ResourceNotFoundError(
      `No published menu found for restaurant ${restaurantId}`,
      "This restaurant may not have a published Menu Protocol menu yet.",
    );
  }

  const { data: categories } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("menu_id", menu.id)
    .order("sort_order", { ascending: true });

  const categoryIds = (categories || []).map((c: { id: string }) => c.id);
  const { data: items } = categoryIds.length > 0
    ? await supabase.from("menu_items").select("*").in("category_id", categoryIds)
    : { data: [] };

  const isIndexed = restaurant.verification_status === "menu_indexed";
  const itemCaution = isIndexed
    ? "Indexed from a public source. Not safe to cite for allergens, dietary restrictions, or final prices; confirm with the restaurant before final action."
    : undefined;

  return {
    citation: buildMenuCitation(restaurant.id),
    version: "1.0",
    domain: "foodnear.me",
    verification_status: restaurant.verification_status,
    trust_notice: buildMenuTrustNotice(
      restaurant.verification_status,
      Boolean(menu.signature_hash),
    ),
    last_updated: menu.updated_at,
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      agent_score: restaurant.agent_score,
    },
    menu: {
      id: menu.id,
      last_updated: menu.updated_at,
      protocol_version: menu.protocol_version,
      categories: (categories || []).map((cat: CategoryRow) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        sort_order: cat.sort_order,
      })),
      items_count: (items || []).length,
      items: (items || []).map((item: ItemRow) => ({
        id: item.id,
        category_id: item.category_id,
        name: item.name,
        description: item.description,
        price: item.price,
        currency: item.currency,
        available: item.available,
        preparation_time_minutes: item.preparation_time_minutes,
        dietary: {
          vegetarian: item.dietary_vegetarian,
          vegan: item.dietary_vegan,
          gluten_free: item.dietary_gluten_free,
          halal: item.dietary_halal,
          kosher: item.dietary_kosher,
          nut_free: item.dietary_nut_free,
        },
        allergens: item.allergens || [],
        customization_options: item.customization_options || [],
        popularity_score: item.popularity_score,
        ...(itemCaution ? { caution: itemCaution } : {}),
      })),
    },
    signature: menu.signature_hash
      ? {
          algorithm: "ed25519",
          signer: menu.signature_signer,
          timestamp: menu.signature_timestamp,
          hash: menu.signature_hash,
          verification_url: buildSigningKeysCitation(),
          note: "Ed25519 signature over the menu payload. Fetch verification_url for the active public key; see https://foodnear.me/SKILL.md#verifying-signatures.",
        }
      : {
          note:
            restaurant.verification_status === "menu_indexed"
              ? "Indexed menu — no owner signature. Not authoritative for allergens/dietary."
              : "Menu pending owner signature",
        },
  };
}
