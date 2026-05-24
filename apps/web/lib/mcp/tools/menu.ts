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
 * Performance: collapses the legacy 4-query chain
 *   (restaurants -> menus -> menu_categories -> menu_items)
 * into a single nested PostgREST select so cold-start p95 drops sharply.
 * See lib/supabase/columns.ts for the projection.
 */

import { createClient } from "@/lib/supabase/server";
import {
  buildClaimInvitation,
  buildMenuTrustNotice,
} from "@/lib/discovery/verification-status";
import {
  buildMenuCitation,
  buildSigningKeysCitation,
  citationFields,
} from "@/lib/mcp/citations";
import { ResourceNotFoundError } from "@/lib/mcp/errors";
import {
  GET_MENU_NESTED_QUERY,
  type NestedMenuCategoryRow,
  type NestedMenuItemRow,
  type NestedRestaurantWithMenuRow,
} from "@/lib/supabase/columns";
import type { GetMenuInput } from "./inputs";

function compareCategories(a: NestedMenuCategoryRow, b: NestedMenuCategoryRow) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

export async function getMenu(input: GetMenuInput) {
  const { restaurant_id: restaurantId } = input;
  const supabase = createClient();

  // Single round-trip: restaurant + published menu + categories + items.
  // The `eq("menus.status", "published")` filter is applied to the nested
  // relation, so the response either contains menus=[<the published menu>]
  // or menus=[] (restaurant accessible, no published menu yet).
  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .select(GET_MENU_NESTED_QUERY)
    .eq("id", restaurantId)
    .in("verification_status", ["verified", "menu_indexed"])
    .eq("menus.status", "published")
    .returns<NestedRestaurantWithMenuRow[]>()
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Database error: ${error.message}`);
  }

  if (!restaurant) {
    throw new ResourceNotFoundError(
      `Restaurant ${restaurantId} not found or has no accessible menu tier`,
      "Use search_restaurants and call get_menu only when menu_available is true.",
    );
  }

  const menu = (restaurant.menus ?? [])[0];
  if (!menu) {
    throw new ResourceNotFoundError(
      `No published menu found for restaurant ${restaurantId}`,
      "This restaurant may not have a published Menu Protocol menu yet.",
    );
  }

  const categories = [...(menu.menu_categories ?? [])].sort(compareCategories);
  const items: NestedMenuItemRow[] = [];
  for (const cat of categories) {
    for (const item of cat.menu_items ?? []) items.push(item);
  }

  const isIndexed = restaurant.verification_status === "menu_indexed";
  const itemCaution = isIndexed
    ? "Indexed from a public source. Not safe to cite for allergens, dietary restrictions, or final prices; confirm with the restaurant before final action."
    : undefined;
  const citation = buildMenuCitation(restaurant.id);
  const claimInvitation = buildClaimInvitation(
    restaurant.id,
    restaurant.verification_status,
    true, // by definition: a published menu exists at this point
  );

  return {
    ...citationFields(citation),
    version: "1.0",
    domain: "foodnear.me",
    verification_status: restaurant.verification_status,
    trust_notice: buildMenuTrustNotice(
      restaurant.verification_status,
      Boolean(menu.signature_hash),
    ),
    ...(claimInvitation ? { claim_invitation: claimInvitation } : {}),
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
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        sort_order: cat.sort_order,
      })),
      items_count: items.length,
      items: items.map((item) => ({
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
          dairy_free: item.dietary_dairy_free,
          low_carb: item.dietary_low_carb,
          keto: item.dietary_keto,
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
          /** Base64url Ed25519 signature. Column name is legacy. */
          signature: menu.signature_hash,
          /** Same as `signature`; retained for backward compatibility with consumers that already read this field. */
          hash: menu.signature_hash,
          /** fnm-v1: SHA-256 hex of canonical content fingerprint. NULL on legacy fnm-v0 menus. */
          payload_hash: menu.payload_hash,
          /** fnm-v0 (legacy tuple-only) | fnm-v1 (content-bound). */
          signing_format: menu.signing_format ?? (menu.payload_hash ? "fnm-v1" : "fnm-v0"),
          verification_url: buildSigningKeysCitation(),
          note:
            menu.signing_format === "fnm-v1" || menu.payload_hash
              ? "Ed25519 signature bound to canonical menu content (fnm-v1). Rebuild canonical content from this response with @foodnearme/menu-protocol, verify payload_hash matches, then verify the signature against the active public key at verification_url. Spec: https://foodnear.me/skills/foodnearme/SKILL.md#verifying-signatures."
              : "Legacy Ed25519 signature (fnm-v0) over the tuple restaurant:menu:signer:timestamp. Proves owner approval at signing time but is not bound to current menu contents; treat content changes since signature_timestamp with caution.",
        }
      : {
          note:
            restaurant.verification_status === "menu_indexed"
              ? "Indexed menu — no owner signature. Not authoritative for allergens/dietary."
              : "Menu pending owner signature",
        },
  };
}
