/**
 * One menu item produced by a parser or a hand-rolled seed.
 *
 * Dietary flags cover the full Menu Protocol v1.0 surface (9 booleans).
 * All are optional and default to FALSE in the insert helper; flip them
 * to TRUE only on an explicit positive signal from the source (e.g. the
 * source page renders "Vegan" badge on the item, the JSON-LD has
 * `suitableForDiet`, etc.). Inferring a flag from the *absence* of an
 * allergen is unsafe and was the bug fixed in the Phase 3a backfill.
 */
export type MenuItemSeed = {
  name: string;
  description?: string;
  price: number;
  dietary_vegetarian?: boolean;
  dietary_vegan?: boolean;
  dietary_gluten_free?: boolean;
  dietary_halal?: boolean;
  dietary_kosher?: boolean;
  dietary_nut_free?: boolean;
  dietary_dairy_free?: boolean;
  dietary_low_carb?: boolean;
  dietary_keto?: boolean;
  allergens?: string[];
  prep_time?: number;
};

export type MenuCategorySeed = {
  name: string;
  items: MenuItemSeed[];
};

export type ParsedMenuResult = {
  categories: MenuCategorySeed[];
  source:
    | "json_ld"
    | "squarespace_html"
    | "html_heuristic"
    | "microdata"
    | "bentobox_jsonld"
    | "sauce_next_data"
    | "toast_json"
    | "toast_apollo"
    | "visible_text"
    | "squarespace_rich"
    | "spotapps_html"
    | "spotapps_html"
    | "square_online_json"
    | "chownow_json"
    | "chownow_api"
    | "order_online_rsc"
    | "popmenu_json"
    | "olo_json"
    | "wix_json"
    | "seed";
};
