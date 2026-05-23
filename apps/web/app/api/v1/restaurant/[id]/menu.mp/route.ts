import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkX402Access } from "@/lib/x402";
import { buildMenuTrustNotice } from "@/lib/discovery/verification-status";
import {
  GET_MENU_NESTED_QUERY,
  type NestedMenuItemRow,
  type NestedRestaurantWithMenuRow,
} from "@/lib/supabase/columns";
import { MENU_CACHE_CONTROL } from "@/lib/http/cache-headers";
import { log } from "@/lib/log";

const PRICE_RANGE_MAP: Record<number, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

// REST menu.mp also needs the address/cuisine/payment metadata that
// MCP get_menu does not surface; load it from the restaurants row with
// an explicit projection (no SELECT *).
const RESTAURANT_PROFILE_FOR_MENU =
  "id, address, cuisine_type, price_range, agent_score, delivery_radius_miles, " +
  "payment_methods, dietary_certifications";

type RestaurantProfileForMenu = {
  id: string;
  address: string | null;
  cuisine_type: string[] | null;
  price_range: number | null;
  agent_score: number | null;
  delivery_radius_miles: number | null;
  payment_methods: string[] | null;
  dietary_certifications: string[] | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const paymentRequired = await checkX402Access(request, "menu");
  if (paymentRequired) return paymentRequired;

  const { id } = await params;

  try {
    const supabase = createClient();

    // Two queries instead of four: nested-select for the menu graph,
    // plus a small projection-only select for the extra restaurant
    // profile fields menu.mp emits (address / payment / dietary cert).
    // Issued in parallel so wall-clock latency is one round-trip.
    const [nestedResult, profileResult] = await Promise.all([
      supabase
        .from("restaurants")
        .select(GET_MENU_NESTED_QUERY)
        .eq("id", id)
        .in("verification_status", ["verified", "menu_indexed"])
        .eq("menus.status", "published")
        .returns<NestedRestaurantWithMenuRow[]>()
        .maybeSingle(),
      supabase
        .from("restaurants")
        .select(RESTAURANT_PROFILE_FOR_MENU)
        .eq("id", id)
        .returns<RestaurantProfileForMenu[]>()
        .maybeSingle(),
    ]);

    const restaurant = nestedResult.data;
    if (nestedResult.error && nestedResult.error.code !== "PGRST116") {
      return NextResponse.json(
        { error: nestedResult.error.message },
        { status: 500 },
      );
    }
    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }

    const menu = (restaurant.menus ?? [])[0];
    if (!menu) {
      return NextResponse.json({ error: "Menu not found" }, { status: 404 });
    }

    const profile = profileResult.data;
    const categories = [...(menu.menu_categories ?? [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );

    const items: NestedMenuItemRow[] = [];
    for (const cat of categories) {
      for (const item of cat.menu_items ?? []) items.push(item);
    }

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
        address: profile?.address
          ? { "@type": "PostalAddress" as const, streetAddress: profile.address }
          : undefined,
        servesCuisine: profile?.cuisine_type ?? undefined,
        priceRange: profile?.price_range ? PRICE_RANGE_MAP[profile.price_range] : undefined,
        agent_score: restaurant.agent_score,
        delivery_radius: profile?.delivery_radius_miles ?? undefined,
        payment_methods: profile?.payment_methods ?? undefined,
        dietary_certifications: profile?.dietary_certifications ?? undefined,

        // Cryptographic proof of owner approval.
        // fnm-v1 signatures bind to canonical menu content via payload_hash;
        // verifiers can re-derive the signing input from this response.
        signature: menu.signature_hash
          ? {
              algorithm: "ed25519" as const,
              signer: menu.signature_signer || "",
              timestamp: menu.signature_timestamp || "",
              signature: menu.signature_hash,
              hash: menu.signature_hash,
              payload_hash: menu.payload_hash,
              signing_format:
                menu.signing_format ?? (menu.payload_hash ? "fnm-v1" : "fnm-v0"),
            }
          : undefined,
      },
      menu: {
        id: menu.id,
        restaurant_id: id,
        last_updated: menu.updated_at,
        language: "en",
        currency: "USD",
        categories: categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          description: cat.description,
          sort_order: cat.sort_order,
        })),
        items: items.map((item) => ({
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
              ? ("https://schema.org/InStock" as const)
              : ("https://schema.org/OutOfStock" as const),
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
            kosher: item.dietary_kosher,
          },
          allergens: item.allergens ?? [],
          customization_options: item.customization_options || [],
          images: [],
          popularity_score: item.popularity_score,
        })),
      },
    };

    return NextResponse.json(menuProtocol, {
      headers: {
        "Cache-Control": MENU_CACHE_CONTROL,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    log.error("menu_mp.handler_failed", {
      restaurant_id: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
