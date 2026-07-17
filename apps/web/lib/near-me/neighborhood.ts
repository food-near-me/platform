/**
 * Best-effort neighborhood label from coords / address (Miami + Jacksonville).
 * Honest: returns null when unsure — never invent a wrong hood.
 */

import type { BeachheadId } from "@/lib/near-me/beachheads";

type Hood = { name: string; lat: number; lng: number; radiusKm: number };

const HOODS: Hood[] = [
  // Miami
  { name: "Brickell", lat: 25.7617, lng: -80.1918, radiusKm: 1.6 },
  { name: "Downtown", lat: 25.775, lng: -80.19, radiusKm: 1.4 },
  { name: "Wynwood", lat: 25.801, lng: -80.199, radiusKm: 1.5 },
  { name: "Design District", lat: 25.813, lng: -80.192, radiusKm: 1.2 },
  { name: "Little Havana", lat: 25.765, lng: -80.22, radiusKm: 1.8 },
  { name: "Coral Gables", lat: 25.75, lng: -80.258, radiusKm: 2.5 },
  { name: "Coconut Grove", lat: 25.728, lng: -80.242, radiusKm: 2.0 },
  { name: "South Beach", lat: 25.7907, lng: -80.13, radiusKm: 2.2 },
  { name: "Miami Beach", lat: 25.81, lng: -80.13, radiusKm: 3.5 },
  { name: "Pinecrest", lat: 25.667, lng: -80.308, radiusKm: 2.5 },
  { name: "Kendall", lat: 25.68, lng: -80.35, radiusKm: 3.5 },
  { name: "Miami Lakes", lat: 25.91, lng: -80.31, radiusKm: 2.5 },
  { name: "The Roads", lat: 25.748, lng: -80.238, radiusKm: 1.2 },
  { name: "Upper Buena Vista", lat: 25.82, lng: -80.191, radiusKm: 0.9 },
  // Jacksonville
  { name: "Riverside", lat: 30.312, lng: -81.7, radiusKm: 2.2 },
  { name: "Avondale", lat: 30.31, lng: -81.71, radiusKm: 1.8 },
  { name: "San Marco", lat: 30.307, lng: -81.654, radiusKm: 2.0 },
  { name: "Downtown Jacksonville", lat: 30.329, lng: -81.655, radiusKm: 1.8 },
  { name: "Jacksonville Beach", lat: 30.29, lng: -81.39, radiusKm: 3.0 },
  { name: "Southside", lat: 30.25, lng: -81.55, radiusKm: 3.5 },
  { name: "Mandarin", lat: 30.16, lng: -81.64, radiusKm: 3.0 },
];

/** Chip list for near-me UI — recenter search on the hood centroid. */
export type FilterNeighborhood = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Search radius when this hood is selected (miles). */
  radiusMiles: number;
};

export const FILTER_NEIGHBORHOODS_MIAMI: FilterNeighborhood[] = [
  { id: "brickell", name: "Brickell", lat: 25.7617, lng: -80.1918, radiusMiles: 2.2 },
  { id: "wynwood", name: "Wynwood", lat: 25.801, lng: -80.199, radiusMiles: 2.0 },
  { id: "design-district", name: "Design District", lat: 25.813, lng: -80.192, radiusMiles: 1.8 },
  { id: "coral-gables", name: "Coral Gables", lat: 25.75, lng: -80.258, radiusMiles: 3.0 },
  { id: "coconut-grove", name: "Coconut Grove", lat: 25.728, lng: -80.242, radiusMiles: 2.5 },
  { id: "south-beach", name: "South Beach", lat: 25.7907, lng: -80.13, radiusMiles: 2.8 },
  { id: "little-havana", name: "Little Havana", lat: 25.765, lng: -80.22, radiusMiles: 2.5 },
  { id: "downtown", name: "Downtown", lat: 25.775, lng: -80.19, radiusMiles: 2.0 },
  { id: "kendall", name: "Kendall", lat: 25.68, lng: -80.35, radiusMiles: 4.0 },
];

export const FILTER_NEIGHBORHOODS_JAX: FilterNeighborhood[] = [
  { id: "riverside", name: "Riverside", lat: 30.312, lng: -81.7, radiusMiles: 2.5 },
  { id: "san-marco", name: "San Marco", lat: 30.307, lng: -81.654, radiusMiles: 2.5 },
  { id: "downtown-jax", name: "Downtown", lat: 30.329, lng: -81.655, radiusMiles: 2.2 },
  { id: "jacksonville-beach", name: "Beach", lat: 30.29, lng: -81.39, radiusMiles: 3.5 },
  { id: "southside", name: "Southside", lat: 30.25, lng: -81.55, radiusMiles: 4.0 },
];

/** @deprecated Prefer getNeighborhoodsForCity — Miami list kept for imports. */
export const FILTER_NEIGHBORHOODS = FILTER_NEIGHBORHOODS_MIAMI;

export function getNeighborhoodsForCity(cityId: BeachheadId): FilterNeighborhood[] {
  return cityId === "jacksonville" ? FILTER_NEIGHBORHOODS_JAX : FILTER_NEIGHBORHOODS_MIAMI;
}

export function getFilterNeighborhood(
  idOrName: string | null | undefined,
  cityId: BeachheadId = "miami",
): FilterNeighborhood | null {
  if (!idOrName) return null;
  const key = idOrName.trim().toLowerCase();
  const list = getNeighborhoodsForCity(cityId);
  return (
    list.find((h) => h.id === key || h.name.toLowerCase() === key) ??
    // Fall back across cities so deep links don't silently drop
    [...FILTER_NEIGHBORHOODS_MIAMI, ...FILTER_NEIGHBORHOODS_JAX].find(
      (h) => h.id === key || h.name.toLowerCase() === key,
    ) ??
    null
  );
}

/** True when address/coords best-effort label matches the selected hood. */
export function matchesNeighborhoodFilter(
  hoodName: string,
  opts: { address?: string | null; lat?: number | null; lng?: number | null },
): boolean {
  const inferred = inferNeighborhood(opts);
  if (!inferred) return false;
  const a = inferred.toLowerCase();
  const b = hoodName.toLowerCase();
  if (a === b) return true;
  // South Beach sits inside broader Miami Beach labeling
  if (b === "south beach" && a === "miami beach") return true;
  if (b === "miami beach" && a === "south beach") return true;
  return false;
}

const ADDRESS_HINTS: Array<{ re: RegExp; name: string }> = [
  { re: /brickell/i, name: "Brickell" },
  { re: /coral gables|giralda|galiano|ponce de leon/i, name: "Coral Gables" },
  { re: /wynwood/i, name: "Wynwood" },
  { re: /little havana|sw 8th|calle ocho/i, name: "Little Havana" },
  { re: /south beach|alton rd|lincoln/i, name: "South Beach" },
  { re: /miami beach/i, name: "Miami Beach" },
  { re: /pinecrest|s dixie/i, name: "Pinecrest" },
  { re: /kendall|sw 72|sw 139/i, name: "Kendall" },
  { re: /miami lakes/i, name: "Miami Lakes" },
  { re: /coconut grove/i, name: "Coconut Grove" },
  { re: /design district|ne 40/i, name: "Design District" },
  { re: /miamicentral|brightline|nw 1st ave/i, name: "Downtown" },
  { re: /buena vista|ne 2nd ave|ne 50/i, name: "Upper Buena Vista" },
  // Jacksonville
  { re: /riverside|stockton st|lomax|five points|king st/i, name: "Riverside" },
  { re: /avondale|st johns ave/i, name: "Avondale" },
  { re: /san marco|hendricks/i, name: "San Marco" },
  { re: /hood landing|mandarin/i, name: "Mandarin" },
  { re: /jacksonville beach|3rd st s|beach blvd/i, name: "Jacksonville Beach" },
  { re: /baymeadows|southside|deerwood/i, name: "Southside" },
  { re: /independent dr|laura st|jacksonville, fl 32202/i, name: "Downtown Jacksonville" },
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function inferNeighborhood(opts: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string | null {
  const addr = opts.address?.trim();
  if (addr) {
    for (const h of ADDRESS_HINTS) {
      if (h.re.test(addr)) return h.name;
    }
  }
  const { lat, lng } = opts;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  let best: { name: string; d: number } | null = null;
  for (const h of HOODS) {
    const d = haversineKm(lat, lng, h.lat, h.lng);
    if (d <= h.radiusKm && (!best || d < best.d)) {
      best = { name: h.name, d };
    }
  }
  return best?.name ?? null;
}
