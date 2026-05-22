import { parseChowNowMenuPayload } from "./parse-chownow-api";
import type { ParsedMenuResult } from "./types";

const CHOWNOW_API = "https://api.chownow.com/api";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type ChowNowIds = {
  companyId: string | null;
  locationId: string | null;
};

export function extractChowNowIds(url: string): ChowNowIds {
  return {
    companyId: url.match(/\/order\/(\d+)/i)?.[1] ?? null,
    locationId: url.match(/\/locations\/(\d+)/i)?.[1] ?? null,
  };
}

export function isChowNowHost(url: string): boolean {
  try {
    return /chownow\.com/i.test(new URL(url).hostname);
  } catch {
    return /chownow\.com/i.test(url);
  }
}

type RestaurantPayload = {
  fulfillment?: Record<
    string,
    { next_available_time?: string | null } | undefined
  >;
};

function menuTimestampFromRestaurant(data: RestaurantPayload): string | null {
  for (const mode of ["pickup", "delivery", "dine_in", "curbside"]) {
    const ts = data.fulfillment?.[mode]?.next_available_time;
    if (ts && /^\d{12}$/.test(ts)) return ts;
  }
  return null;
}

async function fetchChowNowJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${CHOWNOW_API}${path}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function resolveLocationId(
  companyId: string | null,
  locationId: string | null,
): Promise<string | null> {
  if (locationId) return locationId;
  if (!companyId) return null;

  const company = await fetchChowNowJson<{
    locations?: Array<{ id?: string | number }>;
  }>(`/company/${companyId}/restaurants`);

  const first = company?.locations?.[0]?.id;
  return first !== undefined && first !== null ? String(first) : null;
}

async function fetchMenuWithTimestamp(
  locationId: string,
  timestamp: string,
): Promise<ParsedMenuResult | null> {
  const menu = await fetchChowNowJson<unknown>(
    `/restaurant/${locationId}/menu/${timestamp}`,
  );
  return parseChowNowMenuPayload(menu);
}

/**
 * Fetch menu via ChowNow public API (`/api/restaurant/{id}/menu/{timestamp}`).
 * Timestamp comes from the restaurant fulfillment `next_available_time` field.
 */
export async function fetchChowNowMenuForUrl(
  url: string,
): Promise<ParsedMenuResult | null> {
  const { companyId, locationId } = extractChowNowIds(url);
  const resolvedLocationId = await resolveLocationId(companyId, locationId);
  if (!resolvedLocationId) return null;

  const restaurant = await fetchChowNowJson<RestaurantPayload>(
    `/restaurant/${resolvedLocationId}`,
  );
  if (!restaurant) return null;

  const timestamp = menuTimestampFromRestaurant(restaurant);
  if (!timestamp) return null;

  const parsed = await fetchMenuWithTimestamp(resolvedLocationId, timestamp);
  if (parsed) return parsed;

  const day = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 8);
  for (const suffix of ["1115", "1200", "0900"]) {
    const retry = await fetchMenuWithTimestamp(resolvedLocationId, day + suffix);
    if (retry) return retry;
  }

  return null;
}

/** Prefer direct.chownow.com location URLs (ordering.chownow.com often 404s). */
export function normalizeChowNowProbeUrl(url: string): string {
  const { companyId, locationId } = extractChowNowIds(url);
  if (!companyId || !locationId) return url;
  return `https://direct.chownow.com/order/${companyId}/locations/${locationId}`;
}
