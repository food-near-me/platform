import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkX402Access } from "@/lib/x402";
import {
  buildRestSearchLinks,
  buildSearchTrustNotice,
} from "@/lib/discovery/verification-status";

export async function GET(request: Request) {
  const paymentRequired = await checkX402Access(request, "search");
  if (paymentRequired) return paymentRequired;

  const { searchParams } = new URL(request.url);
  
  const query = searchParams.get("query") || "";
  const lat = parseFloat(searchParams.get("lat") || "0");
  const lng = parseFloat(searchParams.get("lng") || "0");
  const radiusMiles = parseFloat(searchParams.get("radius") || "5");
  const minAdo = parseFloat(searchParams.get("ado_min") || "0");
  const dietary = searchParams.getAll("dietary");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "Missing required location parameters: lat, lng" },
      { status: 400 }
    );
  }

  const radiusMeters = radiusMiles * 1609.34;

  try {
    const supabase = createClient();
    
    const { data, error } = await supabase.rpc('search_restaurants_for_agents', {
      search_query: query,
      lat: lat,
      lng: lng,
      radius_meters: radiusMeters,
      min_agent_score: minAdo,
      dietary_filters: dietary.length > 0 ? dietary : undefined
    });

    if (error) {
      console.error("Supabase RPC Error:", error);
      throw error;
    }

    const results = (data || []).map((restaurant: {
      id: string;
      name: string;
      slug: string;
      distance_meters: number;
      agent_score: number;
      cuisine_type: string[];
      verification_status: string;
      menu_available: boolean;
      data_source: string | null;
    }) => {
      const menuAvailable = Boolean(restaurant.menu_available);
      return {
        ...restaurant,
        trust_notice: buildSearchTrustNotice(
          restaurant.verification_status,
          menuAvailable,
        ),
        links: buildRestSearchLinks(restaurant.id, menuAvailable),
      };
    });

    return NextResponse.json({
      metadata: {
        query,
        location: { lat, lng },
        radius_miles: radiusMiles,
        radius_meters: radiusMeters,
        min_ado_score: minAdo,
        dietary_filters: dietary,
        results_count: results.length
      },
      data: results
    });
    
  } catch (error) {
    console.error("Agent Search Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
