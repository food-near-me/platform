/**
 * Centralized PostgREST column projections for the public read surface.
 *
 * Why: prior to this module the codebase used `select("*")` everywhere,
 * which (a) shipped large unnecessary columns to MCP/REST consumers
 * (think `fts` tsvector, `location` geography, ingest metadata), and
 * (b) made any schema addition silently widen every response. Naming
 * the projections in one place keeps the wire format stable and lets
 * the type system catch downstream code that reads fields outside the
 * projection.
 *
 * Add a column here ONLY when the public response actually needs it.
 * If a column starts being needed by a new endpoint, prefer adding it
 * to this file and re-using rather than inlining yet another select
 * string.
 *
 * Usage note: the postgrest-js typed client infers row shape from the
 * SELECT string when it's a *literal*; runtime constants (like these)
 * fall back to a generic error type. Pair each projection with the
 * matching `*Row` type via `.returns<RowType>()` so call sites still
 * get strong field-level types.
 */

import type { VerificationStatus } from "@/lib/discovery/verification-status";

// --- restaurants -----------------------------------------------------

export const RESTAURANT_PROFILE_COLUMNS =
  "id, name, slug, address, cuisine_type, price_range, agent_score, " +
  "verification_status, source, delivery_radius_miles, payment_methods, " +
  "dietary_certifications, website_url, phone, health_inspection_grade, updated_at";

export type RestaurantProfileRow = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  cuisine_type: string[] | null;
  price_range: number | null;
  agent_score: number;
  verification_status: VerificationStatus;
  source: string | null;
  delivery_radius_miles: number | null;
  payment_methods: string[] | null;
  dietary_certifications: string[] | null;
  website_url: string | null;
  phone: string | null;
  health_inspection_grade: string | null;
  updated_at: string;
};

export const RESTAURANT_FOR_MENU_COLUMNS =
  "id, name, slug, agent_score, verification_status";

export type RestaurantForMenuRow = {
  id: string;
  name: string;
  slug: string;
  agent_score: number;
  verification_status: VerificationStatus;
};

export const RESTAURANT_FOR_ADO_COLUMNS =
  "id, name, agent_score, verification_status, cuisine_type, dietary_certifications, updated_at";

export type RestaurantForAdoRow = {
  id: string;
  name: string;
  agent_score: number;
  verification_status: VerificationStatus;
  cuisine_type: string[] | null;
  dietary_certifications: string[] | null;
  updated_at: string;
};

// --- menus / categories / items --------------------------------------

export const MENU_PUBLIC_COLUMNS =
  "id, restaurant_id, protocol_version, status, signature_hash, signature_signer, " +
  "signature_timestamp, payload_hash, signing_format, updated_at";

export const MENU_CATEGORY_COLUMNS =
  "id, menu_id, name, description, sort_order";

export const MENU_ITEM_COLUMNS =
  "id, category_id, name, description, price, currency, available, " +
  "preparation_time_minutes, dietary_vegetarian, dietary_vegan, dietary_gluten_free, " +
  "dietary_halal, dietary_kosher, dietary_nut_free, dietary_dairy_free, dietary_low_carb, " +
  "dietary_keto, allergens, customization_options, popularity_score";

// --- nested-select shapes for get_menu / menu.mp ---------------------

/**
 * Single-round-trip PostgREST query for get_menu and menu.mp.
 *
 * Replaces the legacy 4-query chain (restaurant -> menu -> categories -> items)
 * with a single nested select. Empty `menus` array means "restaurant exists
 * in an accessible tier but has no published menu yet"; null result means
 * "restaurant not found or not in an accessible tier".
 *
 * Pair with `.returns<NestedRestaurantWithMenuRow>()` at the call site.
 */
export const GET_MENU_NESTED_QUERY = `
  ${RESTAURANT_FOR_MENU_COLUMNS},
  menus (
    ${MENU_PUBLIC_COLUMNS},
    menu_categories (
      ${MENU_CATEGORY_COLUMNS},
      menu_items ( ${MENU_ITEM_COLUMNS} )
    )
  )
`;

export type NestedMenuItemRow = {
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
  dietary_dairy_free: boolean;
  dietary_low_carb: boolean;
  dietary_keto: boolean;
  allergens: string[] | null;
  customization_options: unknown;
  popularity_score: number | null;
};

export type NestedMenuCategoryRow = {
  id: string;
  menu_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  menu_items: NestedMenuItemRow[] | null;
};

export type NestedMenuRow = {
  id: string;
  restaurant_id: string;
  protocol_version: string | null;
  status: "draft" | "pending_approval" | "published";
  signature_hash: string | null;
  signature_signer: string | null;
  signature_timestamp: string | null;
  payload_hash: string | null;
  signing_format: "fnm-v0" | "fnm-v1" | null;
  updated_at: string;
  menu_categories: NestedMenuCategoryRow[] | null;
};

export type NestedRestaurantWithMenuRow = RestaurantForMenuRow & {
  menus: NestedMenuRow[] | null;
};
