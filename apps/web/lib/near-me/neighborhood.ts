/**
 * Best-effort Miami neighborhood label from coords / address.
 * Honest: returns null when unsure — never invent a wrong hood.
 */

type Hood = { name: string; lat: number; lng: number; radiusKm: number };

const HOODS: Hood[] = [
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
];

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
