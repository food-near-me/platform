import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkX402Access, getClientIp } from "@/lib/x402";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildClaimInvitation,
  buildRestSearchLinks,
  buildSearchTrustNotice,
} from "@/lib/discovery/verification-status";
import { SEARCH_CACHE_CONTROL } from "@/lib/http/cache-headers";
import { log } from "@/lib/log";

export async function GET(request: Request) {
  const paymentRequired = await checkX402Access(request, "search");
  if (paymentRequired) return paymentRequired;

  const ip = getClientIp(request);
  const rate = await checkRateLimit({ key: `search:${ip}`, limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests — slow down a moment." },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  
  const query = (searchParams.get("query") || "").slice(0, 256);
  const lat = parseFloat(searchParams.get("lat") || "0");
  const lng = parseFloat(searchParams.get("lng") || "0");
  const radiusMiles = Math.min(
    Math.max(parseFloat(searchParams.get("radius") || "5"), 0.5),
    20,
  );
  const minAdo = parseFloat(searchParams.get("ado_min") || "0");
  const dietary = Array.from(new Set(searchParams.getAll("dietary"))).slice(0, 9);

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
      log.error("search.rpc_failed", { error_message: error.message });
      throw error;
    }

    const results = (data ?? []).map((restaurant: any) => {
      const menuAvailable = Boolean(restaurant.menu_available);
      const claimInvitation = buildClaimInvitation(
        restaurant.id,
        restaurant.verification_status,
        menuAvailable,
      );
      return {
        ...restaurant,
        trust_notice: buildSearchTrustNotice(
          restaurant.verification_status,
          menuAvailable,
        ),
        links: buildRestSearchLinks(restaurant.id, menuAvailable),
        ...(claimInvitation ? { claim_invitation: claimInvitation } : {}),
      };
    });

    return NextResponse.json(
      {
        metadata: {
          query,
          location: { lat, lng },
          radius_miles: radiusMiles,
          radius_meters: radiusMeters,
          min_ado_score: minAdo,
          dietary_filters: dietary,
          results_count: results.length,
        },
        data: results,
      },
      {
        headers: {
          "Cache-Control": SEARCH_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    log.error("search.handler_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
