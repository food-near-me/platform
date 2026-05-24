/**
 * Canonical citation URL builders for MCP tool responses.
 *
 * Every MCP tool returns top-level `citation` and `attribution` fields so an
 * agent answering a user can quote a verifiable URL back. Both fields point to
 * the same canonical REST API endpoint or public spec for the underlying data;
 * `citation` is the original FNM field and `attribution` mirrors the emerging
 * local-search MCP convention used by Google Maps Grounding Lite.
 *
 * Keep these in sync with the discovery surface (llms.txt, SKILL.md). When
 * the route shape changes, this module is the single point of truth.
 */

const DEFAULT_BASE_URL = "https://foodnear.me";

export type CitationFields = {
  citation: string;
  attribution: string;
};

export function citationFields(citation: string): CitationFields {
  return {
    citation,
    attribution: citation,
  };
}

function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return DEFAULT_BASE_URL;
  return configured.replace(/\/+$/, "");
}

function appendSearchParams(
  url: URL,
  params: Record<string, string | number | string[] | undefined>,
): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, v);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

export function buildSearchCitation(args: {
  lat: number;
  lng: number;
  radiusMiles: number;
  query?: string;
  dietary?: string[];
  minAdoScore?: number;
}): string {
  const url = new URL(`${baseUrl()}/api/v1/search`);
  appendSearchParams(url, {
    lat: args.lat,
    lng: args.lng,
    radius: args.radiusMiles,
    query: args.query && args.query.length > 0 ? args.query : undefined,
    dietary: args.dietary && args.dietary.length > 0 ? args.dietary : undefined,
    ado_min:
      args.minAdoScore && args.minAdoScore > 0 ? args.minAdoScore : undefined,
  });
  return url.toString();
}

export function buildRestaurantCitation(restaurantId: string): string {
  return `${baseUrl()}/api/v1/restaurant/${restaurantId}`;
}

export function buildMenuCitation(restaurantId: string): string {
  return `${baseUrl()}/api/v1/restaurant/${restaurantId}/menu.mp`;
}

export function buildAdoCitation(restaurantId: string): string {
  return `${baseUrl()}/api/v1/restaurant/${restaurantId}#ado`;
}

export function buildValidateCitation(): string {
  return `${baseUrl()}/skills/foodnearme/SKILL.md`;
}

export function buildExploreCitation(args: {
  lat: number;
  lng: number;
  radiusMeters: number;
  dietary?: string[];
  topNPerTier: number;
}): string {
  const url = new URL(`${baseUrl()}/api/v1/explore`);
  appendSearchParams(url, {
    lat: args.lat,
    lng: args.lng,
    radius_meters: args.radiusMeters,
    dietary: args.dietary && args.dietary.length > 0 ? args.dietary : undefined,
    top_n_per_tier: args.topNPerTier,
  });
  return url.toString();
}

export function buildCompareCitation(args: {
  restaurantIds: string[];
  dietary: string[];
}): string {
  const url = new URL(`${baseUrl()}/api/v1/compare`);
  appendSearchParams(url, {
    restaurant_id: args.restaurantIds,
    dietary: args.dietary,
  });
  return url.toString();
}

export function buildAlongRouteCitation(args: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  dietary?: string[];
  maxResults: number;
  routeMethod: string;
}): string {
  const url = new URL(`${baseUrl()}/api/v1/along-route`);
  appendSearchParams(url, {
    origin_lat: args.origin.latitude,
    origin_lng: args.origin.longitude,
    destination_lat: args.destination.latitude,
    destination_lng: args.destination.longitude,
    dietary: args.dietary && args.dietary.length > 0 ? args.dietary : undefined,
    max_results: args.maxResults,
    route_method: args.routeMethod,
  });
  return url.toString();
}

export function buildSigningKeysCitation(): string {
  return `${baseUrl()}/.well-known/menu-signing-keys.json`;
}
