import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { VerificationStatus } from "@/lib/discovery/verification-status";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Anon-key (RLS-enforced) Supabase client for server-side reads.
 *
 * The generic argument is parameterised against the schema described
 * in this file so every `.from(...)` / `.rpc(...)` chain is type-checked:
 * column projections, filter predicates, and RPC arg/return shapes are
 * all known to the compiler. Service-role writes go through
 * `lib/supabase-admin.ts` instead.
 */
export function createClient(): SupabaseClient<Database> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type MenuStatus = "draft" | "pending_approval" | "published";

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  /** PostGIS GEOGRAPHY(POINT, 4326) — opaque to TS, fetched via RPCs. */
  location: unknown;
  address: string | null;
  delivery_radius_miles: number;
  cuisine_type: string[];
  price_range: number | null;
  agent_score: number;
  /**
   * Three-tier trust ladder. Source of truth: `lib/discovery/verification-status.ts`.
   * Kept in sync with the SQL CHECK constraint by `npm run check:enums`.
   */
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

  /** tsvector — opaque to TS clients. */
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
  // Full Menu Protocol v1.0 dietary flag set (9 flags). All default FALSE in
  // the database; only flipped to TRUE on an explicit positive signal.
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
  /** tsvector — opaque to TS clients. */
  fts: unknown;
};

/**
 * `Insert` and `Update` shapes for the public anon client.
 *
 * Anon writes are blocked by RLS (see `database/migrations/20260523_rls_hardening.sql`).
 * Insert/Update types are left intentionally permissive (`Partial<Row>`) so
 * service-role code paths that share the typed client signature do not
 * paint themselves into a corner; structural correctness for admin writes
 * is enforced by the admin client and database constraints.
 *
 * `Relationships: []` is required by `postgrest-js`'s `GenericTable` even
 * when we don't model foreign-key joins; otherwise the type system widens
 * `.from(...)` results to `never`.
 */
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
          verification_status: VerificationStatus;
          menu_available: boolean;
          data_source: string | null;
        }[];
      };
    };
  };
};

// Convenience aliases for downstream code (tools, REST routes).
export type Restaurant = RestaurantRow;
export type Menu = MenuRow;
export type MenuCategory = MenuCategoryRow;
export type MenuItem = MenuItemRow;
export type SearchRestaurantsRow = Database["public"]["Functions"]["search_restaurants_for_agents"]["Returns"][number];
