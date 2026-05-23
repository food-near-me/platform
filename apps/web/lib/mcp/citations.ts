/**
 * Canonical citation URL builders for MCP tool responses.
 *
 * Every MCP tool returns a top-level `citation` field so that an agent
 * answering a user can quote a verifiable URL back. The URLs point to the
 * canonical REST API endpoint or public spec for the underlying data so the
 * agent (or end user) can re-fetch the same data on demand.
 *
 * Keep these in sync with the discovery surface (llms.txt, SKILL.md). When
 * the route shape changes, this module is the single point of truth.
 */

const DEFAULT_BASE_URL = "https://foodnear.me";

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
  return `${baseUrl()}/SKILL.md#menu-protocol-v1`;
}

export function buildSigningKeysCitation(): string {
  return `${baseUrl()}/.well-known/menu-signing-keys.json`;
}
