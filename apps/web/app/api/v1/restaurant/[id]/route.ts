import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkX402Access } from "@/lib/x402";
import {
  buildProfileTrustNotice,
  hasMenuAccess,
} from "@/lib/discovery/verification-status";
import {
  RESTAURANT_PROFILE_COLUMNS,
  type RestaurantProfileRow,
} from "@/lib/supabase/columns";

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
  const paymentRequired = await checkX402Access(request, "restaurant");
  if (paymentRequired) return paymentRequired;

  const { id } = await params;

  try {
    const supabase = createClient();

    const { data: restaurant, error } = await supabase
      .from("restaurants")
      .select(RESTAURANT_PROFILE_COLUMNS)
      .eq("id", id)
      .in("verification_status", ["discovered", "menu_indexed", "verified"])
      .returns<RestaurantProfileRow[]>()
      .single();

    if (error || !restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    const menuTier = hasMenuAccess(restaurant.verification_status);
    const { data: publishedMenu } = menuTier
      ? await supabase
          .from("menus")
          .select("id")
          .eq("restaurant_id", id)
          .eq("status", "published")
          .maybeSingle()
      : { data: null };

    const menuAvailable = menuTier && Boolean(publishedMenu);

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
      agent_score: restaurant.agent_score,
      verification_status: restaurant.verification_status,
      menu_available: menuAvailable,
      data_source: restaurant.source ?? null,
      trust_notice: buildProfileTrustNotice(
        restaurant.verification_status,
        menuAvailable,
      ),
      delivery_radius_miles: restaurant.delivery_radius_miles,
      payment_methods: restaurant.payment_methods,
      dietary_certifications: restaurant.dietary_certifications,
      website_url: restaurant.website_url ?? null,
      phone: restaurant.phone ?? null,
      links: menuAvailable
        ? { menu: `/api/v1/restaurant/${id}/menu.mp` }
        : { claim: `/claim/${id}` },
    };

    return NextResponse.json(restaurantProfile);
    
  } catch (error) {
    console.error("Get Restaurant Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
