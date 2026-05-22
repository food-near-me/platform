export type MenuItemSeed = {
  name: string;
  description?: string;
  price: number;
  dietary_vegetarian?: boolean;
  dietary_vegan?: boolean;
  dietary_gluten_free?: boolean;
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
    | "spotapps_html"
    | "square_online_json"
    | "chownow_json"
    | "chownow_api"
    | "order_online_rsc"
    | "popmenu_json"
    | "olo_json"
    | "seed";
};
