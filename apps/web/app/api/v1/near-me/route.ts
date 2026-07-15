import { NextResponse } from "next/server";
import { getSql, isDatabaseConfigured } from "@/lib/db/neon";
import { buildSearchTrustNotice } from "@/lib/discovery/verification-status";
import { telHref } from "@/lib/near-me/hours";
import {
  isAllergyNeed,
  rankPlaces,
  safetyTierLabel,
  type AllergySafetyTier,
  type RankablePlace,
} from "@/lib/near-me/rank";
import { log } from "@/lib/log";

const MAX_RESULTS = 8;
const DEFAULT_RADIUS_MILES = 3;
/** Wider radius when filtering by allergy need so curated Greater Miami spots surface. */
const ALLERGY_RADIUS_MILES = 12;
const DEFAULT_TZ = "America/New_York";

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

function trustLabel(status: string): string {
  if (status === "verified") return "verified";
  if (status === "menu_indexed") return "menu indexed";
  return "listed";
}

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

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") || "").trim();
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const needRaw = (searchParams.get("need") || "").trim().toLowerCase();
  const need = needRaw && isAllergyNeed(needRaw) ? needRaw : null;
  const openNowOnly =
    searchParams.get("open_now") === "1" || searchParams.get("open_now") === "true";
  const defaultRadius = need ? ALLERGY_RADIUS_MILES : DEFAULT_RADIUS_MILES;
  const radiusMiles = Math.min(
    Math.max(parseFloat(searchParams.get("radius") || String(defaultRadius)), 0.5),
    20,
  );
  const city = (searchParams.get("city") || "unknown").slice(0, 64);
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
    const rows = (await sql.query(
      `SELECT * FROM search_restaurants_for_agents(
        search_query := $1,
        lat := $2,
        lng := $3,
        radius_meters := $4,
        min_agent_score := $5,
        dietary_filters := $6::text[]
      )`,
      [query, lat, lng, radiusMeters, 0, []],
    )) as SearchRow[];

    // Also pull curated allergy places in radius that FTS query might miss
    const curatedExtra =
      need && !query
        ? ((await sql.query(
            `SELECT
               id, name, slug,
               ST_Distance(location, ST_SetSRID(ST_MakePoint($2,$1), 4326)::geography) AS distance_meters,
               agent_score, cuisine_type, verification_status,
               false AS menu_available, source AS data_source
             FROM restaurants
             WHERE allergy_needs @> ARRAY[$3]::text[]
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
            [lat, lng, need, radiusMeters],
          )) as SearchRow[])
        : [];

    const byId = new Map<string, SearchRow>();
    for (const r of [...rows, ...curatedExtra]) byId.set(r.id, r);
    const merged = [...byId.values()];

    const ids = merged.map((r) => r.id);
    const profileById = new Map<string, ProfileRow>();
    if (ids.length) {
      const profiles = (await sql.query(
        `SELECT id, address, website_url, phone, opening_hours,
                allergy_needs, allergy_safety_tier, allergy_safety_note
         FROM restaurants WHERE id = ANY($1::uuid[])`,
        [ids],
      )) as ProfileRow[];
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
        allergy_safety_tier: (p?.allergy_safety_tier as AllergySafetyTier) || "unknown",
        allergy_safety_note: p?.allergy_safety_note ?? null,
      };
    });

    const ranked = rankPlaces(candidates, {
      query,
      timeZone,
      need,
      openNowOnly,
      limit: MAX_RESULTS,
    });

    const curatedCount = ranked.filter((r) => r.matches_need).length;

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
      trust_notice: buildSearchTrustNotice(
        r.verification_status as "discovered" | "menu_indexed" | "verified",
        r.menu_available,
      ),
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
          [need ? `need:${need}` : "", openNowOnly ? "open_now" : "", query]
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
        open_now: openNowOnly,
        city,
        source,
        location: { lat, lng },
        radius_miles: radiusMiles,
        results_count: data.length,
        curated_matches: curatedCount,
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
