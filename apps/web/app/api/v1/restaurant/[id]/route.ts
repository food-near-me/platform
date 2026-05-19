import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PRICE_RANGE_MAP: Record<number, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$"
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = createClient();

    const { data: restaurant, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", id)
      .eq("verification_status", "verified")
      .single();

    if (error || !restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    // Transform to Schema.org compatible format
    const restaurantProfile = {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      address: restaurant.address ? {
        "@type": "PostalAddress",
        streetAddress: restaurant.address
      } : undefined,
      servesCuisine: restaurant.cuisine_type,
      priceRange: restaurant.price_range ? PRICE_RANGE_MAP[restaurant.price_range] : undefined,
      
      // Menu Protocol Extensions
      agent_score: restaurant.agent_score,
      verification_status: restaurant.verification_status,
      delivery_radius_miles: restaurant.delivery_radius_miles,
      payment_methods: restaurant.payment_methods,
      dietary_certifications: restaurant.dietary_certifications,
      
      links: {
        menu: `/api/v1/restaurant/${id}/menu.mp`
      }
    };

    return NextResponse.json(restaurantProfile);
    
  } catch (error) {
    console.error("Get Restaurant Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
