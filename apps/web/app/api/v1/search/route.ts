import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Extract agent search parameters
  const query = searchParams.get("query") || "";
  const lat = parseFloat(searchParams.get("lat") || "0");
  const lng = parseFloat(searchParams.get("lng") || "0");
  const radiusMiles = parseFloat(searchParams.get("radius") || "5");
  const minAdo = parseFloat(searchParams.get("ado_min") || "0");
  const dietary = searchParams.getAll("dietary"); // e.g., ?dietary=vegan&dietary=gluten_free

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "Missing required location parameters: lat, lng" },
      { status: 400 }
    );
  }

  // Convert miles to meters for PostGIS
  const radiusMeters = radiusMiles * 1609.34;

  try {
    const supabase = createClient();
    
    // Call the Supabase RPC function for combined FTS + PostGIS search
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

    // Transform results to include links
    const results = (data || []).map((restaurant: {
      id: string;
      name: string;
      slug: string;
      distance_meters: number;
      agent_score: number;
      cuisine_type: string[];
    }) => ({
      ...restaurant,
      links: {
        profile: `/api/v1/restaurant/${restaurant.id}`,
        menu: `/api/v1/restaurant/${restaurant.id}/menu.mp`
      }
    }));

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
