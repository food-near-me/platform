/**
 * Database client for server-side reads/writes.
 *
 * Historically this wrapped `@supabase/supabase-js`. It now returns a Neon
 * HTTP adapter with the same `.from()` / `.rpc()` call shape so existing
 * call sites keep working. Types below still describe the Postgres schema.
 */

import type { VerificationStatus } from "@/lib/discovery/verification-status";
import { createNeonDbClient, type NeonDbClient } from "@/lib/db/compat";
import { isDatabaseConfigured } from "@/lib/db/neon";

export function createClient(): NeonDbClient {
  if (!isDatabaseConfigured()) {
    throw new Error("Missing DATABASE_URL (Neon connection string)");
  }
  return createNeonDbClient();
}

export type MenuStatus = "draft" | "pending_approval" | "published";

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  location: unknown;
  address: string | null;
  delivery_radius_miles: number;
  cuisine_type: string[];
  price_range: number | null;
  agent_score: number;
  verification_status: VerificationStatus;
  payment_methods: string[];
  dietary_certifications: string[];
  source: string | null;
  source_record_id: string | null;
  import_confidence: number | null;
  discovered_at: string | null;
  last_external_update: string | null;
  website_url: string | null;
  phone: string | null;
  health_inspection_grade: string | null;
  created_at: string;
  updated_at: string;
  fts: unknown;
};

type MenuRow = {
  id: string;
  restaurant_id: string;
  protocol_version: string;
  status: MenuStatus;
  signature_hash: string | null;
  signature_signer: string | null;
  signature_timestamp: string | null;
  payload_hash: string | null;
  signing_format: "fnm-v0" | "fnm-v1" | null;
  created_at: string;
  updated_at: string;
};

type MenuCategoryRow = {
  id: string;
  menu_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
};

type MenuItemRow = {
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
  allergens: string[];
  customization_options: unknown;
  popularity_score: number;
  created_at: string;
  updated_at: string;
  fts: unknown;
};

type TableEntry<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      restaurants: TableEntry<RestaurantRow>;
      menus: TableEntry<MenuRow>;
      menu_categories: TableEntry<MenuCategoryRow>;
      menu_items: TableEntry<MenuItemRow>;
    };
    Views: Record<string, never>;
    Functions: {
      search_restaurants_for_agents: {
        Args: {
          search_query: string;
          lat: number;
          lng: number;
          radius_meters: number;
          min_agent_score?: number;
          dietary_filters?: string[];
        };
        Returns: {
          id: string;
          name: string;
          slug: string;
          distance_meters: number;
          agent_score: number;
          cuisine_type: string[];
          verification_status: string;
          menu_available: boolean;
          data_source: string | null;
        }[];
      };
    };
  };
};
