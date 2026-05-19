import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type Database = {
  public: {
    Tables: {
      restaurants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          location: unknown;
          address: string | null;
          delivery_radius_miles: number;
          cuisine_type: string[];
          price_range: number | null;
          agent_score: number;
          verification_status: "discovered" | "menu_indexed" | "verified";
          payment_methods: string[];
          dietary_certifications: string[];
          created_at: string;
          updated_at: string;
        };
      };
      menus: {
        Row: {
          id: string;
          restaurant_id: string;
          protocol_version: string;
          status: "draft" | "pending_approval" | "published";
          signature_hash: string | null;
          signature_signer: string | null;
          signature_timestamp: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      menu_categories: {
        Row: {
          id: string;
          menu_id: string;
          name: string;
          description: string | null;
          sort_order: number;
          created_at: string;
        };
      };
      menu_items: {
        Row: {
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
          created_at: string;
          updated_at: string;
        };
      };
    };
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
        }[];
      };
    };
  };
};
