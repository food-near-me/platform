import { NextResponse } from "next/server";
import { getSql, isDatabaseConfigured, sqlQuery } from "@/lib/db/neon";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/x402";
import { buildSearchTrustNotice } from "@/lib/discovery/verification-status";
import { telHref } from "@/lib/near-me/hours";
import { trustLabel } from "@/lib/near-me/labels";
import { getFilterNeighborhood } from "@/lib/near-me/neighborhood";
import {
  isAllergyNeed,
  isAllergySafetyTier,
  rankPlaces,
  safetyTierLabel,
  type RankablePlace,
} from "@/lib/near-me/rank";
import { log } from "@/lib/log";

const MAX_RESULTS = 8;
const DEFAULT_RADIUS_MILES = 3;
/** Wider radius when filtering by allergy need so curated Greater Miami spots surface. */
const ALLERGY_RADIUS_MILES = 12;
const DEFAULT_TZ = "America/New_York";

/** Parse need= from query: repeated params and/or comma-separated values. */
function parseNeedsParam(searchParams: URLSearchParams): string[] {
  const collected: string[] = [];
  for (const raw of searchParams.getAll("need")) {
    for (const part of raw.split(/[,+]/)) {
      const v = part.trim().toLowerCase();
      if (v && isAllergyNeed(v) && !collected.includes(v)) collected.push(v);
    }
  }
  return collected;
}

type SearchRow = {
  id: string;
  name: string;
  slug: string;
  distance_meters: number;
  agent_score: number;
  cuisine_type: string[] | null;
  verification_status: string;
  menu_available: boolean;
  data_source: string | null;
};

type ProfileRow = {
  id: string;
  address: string | null;
  website_url: string | null;
  phone: string | null;
  opening_hours: string | null;
  allergy_needs: string[] | null;
  allergy_safety_tier: string | null;
  allergy_safety_note: string | null;
};

function mapsUrl(name: string, address?: string | null) {
  const q = encodeURIComponent([name, address].filter(Boolean).join(", "));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function placeUrl(slug: string) {
  return `/place/${encodeURIComponent(slug)}`;
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Search unavailable — database not configured" },
      { status: 503 },
    );
  }

  // Public endpoint — per-IP flood protection. Generous, since the UI fires a
  // search on each filter change. Degrades to best-effort in-memory if Upstash
  // is unconfigured, never blocking legitimate use.
  const ip = getClientIp(request);
  const rate = await checkRateLimit({ key: `near-me:${ip}`, limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests — slow down a moment." },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") || "").trim().slice(0, 256);
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const needs = parseNeedsParam(searchParams);
  const need = needs.length === 1 ? needs[0]! : needs.length > 1 ? needs.join(",") : null;
  const openNowOnly =
    searchParams.get("open_now") === "1" || searchParams.get("open_now") === "true";
  const neighborhoodRaw = (searchParams.get("neighborhood") || "").trim();
  const neighborhood = getFilterNeighborhood(neighborhoodRaw);
  const defaultRadius = neighborhood
    ? neighborhood.radiusMiles
    : needs.length > 0
      ? ALLERGY_RADIUS_MILES
      : DEFAULT_RADIUS_MILES;
  const radiusMiles = Math.min(
    Math.max(parseFloat(searchParams.get("radius") || String(defaultRadius)), 0.5),
    20,
  );
  const city = (searchParams.get("city") || neighborhood?.name || "unknown").slice(0, 64);
  const sourceParam = searchParams.get("source");
  const source = sourceParam === "geo" ? "geo" : "fallback";
  const timeZone = (searchParams.get("tz") || DEFAULT_TZ).slice(0, 64);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "Missing required location parameters: lat, lng" },
      { status: 400 },
    );
  }

  const radiusMeters = radiusMiles * 1609.34;
  const sql = getSql();

  try {
    const rows = await sqlQuery<SearchRow>(
      `SELECT * FROM search_restaurants_for_agents(
        search_query := $1,
        lat := $2,
        lng := $3,
        radius_meters := $4,
        min_agent_score := $5,
        dietary_filters := $6::text[]
      )`,
      [query, lat, lng, radiusMeters, 0, []],
    );

    // Always pull curated allergy places in radius when needs are set (even with a
    // cuisine query) so Also nearby stays on-need instead of padding with chains.
    // AND semantics: allergy_needs must contain every selected need.
    const curatedExtra =
      needs.length > 0
        ? await sqlQuery<SearchRow>(
            `SELECT
               id, name, slug,
               ST_Distance(location, ST_SetSRID(ST_MakePoint($2,$1), 4326)::geography) AS distance_meters,
               agent_score, cuisine_type, verification_status,
               false AS menu_available, source AS data_source
             FROM restaurants
             WHERE allergy_needs @> $3::text[]
               -- honesty guard: only curated tiers may surface for a need filter
               AND allergy_safety_tier IN ('dedicated', 'strong_protocol', 'shared_verify')
               AND ST_DWithin(
                 location,
                 ST_SetSRID(ST_MakePoint($2,$1), 4326)::geography,
                 $4
               )
             ORDER BY
               CASE allergy_safety_tier
                 WHEN 'dedicated' THEN 0
                 WHEN 'strong_protocol' THEN 1
                 WHEN 'shared_verify' THEN 2
                 ELSE 3
               END,
               location <-> ST_SetSRID(ST_MakePoint($2,$1), 4326)::geography
             LIMIT 30`,
            [lat, lng, needs, radiusMeters],
          )
        : [];

    // Main-search rows carry the authoritative menu_available; let them win over
    // the curatedExtra stub (which hardcodes false) when a place is in both.
    const byId = new Map<string, SearchRow>();
    for (const r of [...curatedExtra, ...rows]) byId.set(r.id, r);
    const merged = [...byId.values()];

    const ids = merged.map((r) => r.id);
    const profileById = new Map<string, ProfileRow>();
    if (ids.length) {
      const profiles = await sqlQuery<ProfileRow>(
        `SELECT id, address, website_url, phone, opening_hours,
                allergy_needs, allergy_safety_tier, allergy_safety_note
         FROM restaurants WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      for (const p of profiles) profileById.set(p.id, p);
    }

    const candidates: RankablePlace[] = merged.map((r) => {
      const p = profileById.get(r.id);
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        distance_meters: Number(r.distance_meters),
        cuisine_type: r.cuisine_type ?? [],
        verification_status: r.verification_status,
        menu_available: Boolean(r.menu_available),
        address: p?.address ?? null,
        website_url: p?.website_url ?? null,
        phone: p?.phone ?? null,
        opening_hours: p?.opening_hours ?? null,
        data_source: r.data_source,
        allergy_needs: p?.allergy_needs ?? [],
        allergy_safety_tier: isAllergySafetyTier(p?.allergy_safety_tier)
          ? p.allergy_safety_tier
          : "unknown",
        allergy_safety_note: p?.allergy_safety_note ?? null,
      };
    });

    const ranked = rankPlaces(candidates, {
      query,
      timeZone,
      need: needs,
      openNowOnly,
      limit: MAX_RESULTS,
    });

    const data = ranked.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      place_url: placeUrl(r.slug),
      distance_meters: Math.round(r.distance_meters),
      distance_miles: r.distance_miles,
      cuisine_type: r.cuisine_type,
      verification_status: r.verification_status,
      trust_label: trustLabel(r.verification_status),
      trust_notice: buildSearchTrustNotice(r.verification_status, r.menu_available),
      menu_available: r.menu_available,
      address: r.address,
      website_url: r.website_url,
      phone: r.phone,
      phone_url: telHref(r.phone),
      maps_url: mapsUrl(r.name, r.address),
      opening_hours: r.opening_hours,
      open_now: r.open_now,
      hours_label: r.hours_label,
      hours_detail: r.hours_detail,
      is_top_pick: r.is_top_pick,
      is_chain: r.is_chain,
      allergy_needs: r.allergy_needs,
      allergy_safety_tier: r.allergy_safety_tier,
      allergy_safety_label: safetyTierLabel(r.allergy_safety_tier),
      allergy_safety_note: r.allergy_safety_note,
      matches_need: r.matches_need,
      why: r.why,
    }));

    void sql
      .query(
        `INSERT INTO near_me_usage (city, source, query, result_count, ok)
         VALUES ($1, $2, $3, $4, true)`,
        [
          city,
          source,
          [
            needs.length ? `need:${needs.join("+")}` : "",
            openNowOnly ? "open_now" : "",
            neighborhood ? `hood:${neighborhood.id}` : "",
            query,
          ]
            .filter(Boolean)
            .join(" ")
            .slice(0, 80),
          data.length,
        ],
      )
      .catch((e) =>
        log.warn("near_me.usage_log_failed", {
          error: e instanceof Error ? e.message : String(e),
        }),
      );

    return NextResponse.json({
      metadata: {
        query,
        need,
        needs,
        open_now: openNowOnly,
        neighborhood: neighborhood?.name ?? null,
        city,
        source,
        location: { lat, lng },
        radius_miles: radiusMiles,
        results_count: data.length,
        ranking: "human_v1_allergy",
        time_zone: timeZone,
        top_pick_id: data[0]?.id ?? null,
        allergy_disclaimer:
          "Curated safety notes describe kitchen mechanism, not a medical guarantee. Always verify with the restaurant. For celiac, cross-check Find Me Gluten Free.",
      },
      data,
    });
  } catch (error) {
    log.error("near_me.search_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    void sql
      .query(
        `INSERT INTO near_me_usage (city, source, query, result_count, ok)
         VALUES ($1, $2, $3, 0, false)`,
        [city, source, query.slice(0, 80)],
      )
      .catch(() => {});
    return NextResponse.json(
      { error: "Search unavailable — try again in a moment" },
      { status: 500 },
    );
  }
}
