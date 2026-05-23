import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkX402Access } from "@/lib/x402";
import { buildMenuTrustNotice } from "@/lib/discovery/verification-status";

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
  const paymentRequired = await checkX402Access(request, "menu");
  if (paymentRequired) return paymentRequired;

  const { id } = await params;

  try {
    const supabase = createClient();

    // Fetch restaurant
    const { data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", id)
      .in("verification_status", ["verified", "menu_indexed"])
      .single();

    if (restaurantError || !restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    // Fetch menu
    const { data: menu, error: menuError } = await supabase
      .from("menus")
      .select("*")
      .eq("restaurant_id", id)
      .eq("status", "published")
      .single();

    if (menuError || !menu) {
      return NextResponse.json(
        { error: "Menu not found" },
        { status: 404 }
      );
    }

    // Fetch categories
    const { data: categories } = await supabase
      .from("menu_categories")
      .select("*")
      .eq("menu_id", menu.id)
      .order("sort_order", { ascending: true });

    // Fetch items
    const categoryIds = (categories || []).map(c => c.id);
    const { data: items } = await supabase
      .from("menu_items")
      .select("*")
      .in("category_id", categoryIds);

    // Build Menu Protocol response
    const menuProtocol = {
      version: "1.0" as const,
      domain: "foodnear.me" as const,
      verification_status: restaurant.verification_status,
      trust_notice: buildMenuTrustNotice(
        restaurant.verification_status,
        Boolean(menu.signature_hash),
      ),
      restaurant: {
        "@context": "https://schema.org" as const,
        "@type": "Restaurant" as const,
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        address: restaurant.address ? {
          "@type": "PostalAddress" as const,
          streetAddress: restaurant.address
        } : undefined,
        servesCuisine: restaurant.cuisine_type,
        priceRange: restaurant.price_range ? PRICE_RANGE_MAP[restaurant.price_range] : undefined,
        agent_score: restaurant.agent_score,
        delivery_radius: restaurant.delivery_radius_miles,
        payment_methods: restaurant.payment_methods,
        dietary_certifications: restaurant.dietary_certifications,
        
        // Cryptographic proof of owner approval.
        // fnm-v1 signatures bind to canonical menu content via payload_hash;
        // verifiers can re-derive the signing input from this response.
        signature: menu.signature_hash ? {
          algorithm: "ed25519" as const,
          signer: menu.signature_signer || "",
          timestamp: menu.signature_timestamp || "",
          signature: menu.signature_hash,
          hash: menu.signature_hash,
          payload_hash: menu.payload_hash,
          signing_format: menu.signing_format ?? (menu.payload_hash ? "fnm-v1" : "fnm-v0"),
        } : undefined
      },
      menu: {
        id: menu.id,
        restaurant_id: id,
        last_updated: menu.updated_at,
        language: "en",
        currency: "USD",
        categories: (categories || []).map(cat => ({
          id: cat.id,
          name: cat.name,
          description: cat.description,
          sort_order: cat.sort_order
        })),
        items: (items || []).map(item => ({
          "@type": "MenuItem" as const,
          id: item.id,
          category_id: item.category_id,
          name: item.name,
          description: item.description,
          offers: {
            "@type": "Offer" as const,
            price: item.price,
            priceCurrency: item.currency,
            availability: item.available 
              ? "https://schema.org/InStock" as const
              : "https://schema.org/OutOfStock" as const
          },
          available: item.available,
          preparation_time: item.preparation_time_minutes,
          dietary: {
            vegetarian: item.dietary_vegetarian,
            vegan: item.dietary_vegan,
            gluten_free: item.dietary_gluten_free,
            nut_free: item.dietary_nut_free,
            dairy_free: item.dietary_dairy_free,
            low_carb: item.dietary_low_carb,
            keto: item.dietary_keto,
            halal: item.dietary_halal,
            kosher: item.dietary_kosher
          },
          allergens: item.allergens,
          customization_options: item.customization_options || [],
          images: [],
          popularity_score: item.popularity_score
        }))
      }
    };

    return NextResponse.json(menuProtocol, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        "Content-Type": "application/json"
      }
    });
    
  } catch (error) {
    console.error("Get Menu Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
