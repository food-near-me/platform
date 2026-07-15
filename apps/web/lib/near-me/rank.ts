/**
 * Human ranking for consumer near-me — distance + contact + hours + allergy curation.
 * Soft-demotes mega-chains. Allergy boosts only apply to curated profiles (never OSM guesses).
 */

import { evaluateOpeningHours, type HoursStatus } from "@/lib/near-me/hours";

export const ALLERGY_NEEDS = [
  "gluten_free",
  "dairy_free",
  "nut_aware",
  "vegetarian",
] as const;

export type AllergyNeed = (typeof ALLERGY_NEEDS)[number];

export type AllergySafetyTier =
  | "dedicated"
  | "strong_protocol"
  | "shared_verify"
  | "unknown";

export type RankablePlace = {
  id: string;
  name: string;
  slug: string;
  distance_meters: number;
  cuisine_type: string[];
  verification_status: string;
  menu_available: boolean;
  address: string | null;
  website_url: string | null;
  phone: string | null;
  opening_hours: string | null;
  data_source: string | null;
  allergy_needs: string[];
  allergy_safety_tier: AllergySafetyTier | string;
  allergy_safety_note: string | null;
};

export type RankedPlace = RankablePlace &
  HoursStatus & {
    score: number;
    score_breakdown: Record<string, number>;
    is_chain: boolean;
    is_top_pick: boolean;
    distance_miles: number;
    matches_need: boolean;
    why: string | null;
  };

const MEGA_CHAINS = [
  "mcdonald",
  "burger king",
  "wendy",
  "taco bell",
  "subway",
  "domino",
  "pizza hut",
  "papa john",
  "kfc",
  "kentucky fried",
  "chick-fil-a",
  "chickfila",
  "starbucks",
  "dunkin",
  "chipotle",
  "panera",
  "five guys",
  "popeyes",
  "little caesar",
  "jimmy john",
  "arby",
  "sonic drive",
  "dairy queen",
  "applebee",
  "chili's",
  "chilis",
  "olive garden",
  "ihop",
  "denny",
  "outback",
  "red lobster",
  "buffalo wild",
  "häagen-dazs",
  "haagen-dazs",
  "haagen dazs",
  "baskin",
  "wingstop",
  "papa murphy",
  "jersey mike",
  "firehouse subs",
  "qdoba",
  "panda express",
  "cracker barrel",
];

const TIER_LABEL: Record<string, string> = {
  dedicated: "Dedicated / specialty facility",
  strong_protocol: "Strong allergy protocols (shared kitchen)",
  shared_verify: "Shared kitchen — verify before you go",
  unknown: "No curated allergy info",
};

export function isAllergyNeed(value: string): value is AllergyNeed {
  return (ALLERGY_NEEDS as readonly string[]).includes(value);
}

export function isMegaChain(name: string): boolean {
  const n = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  return MEGA_CHAINS.some((c) => n.includes(c));
}

export function safetyTierLabel(tier: string): string {
  return TIER_LABEL[tier] ?? TIER_LABEL.unknown;
}

export function buildWhy(place: RankablePlace, need?: string | null): string | null {
  const note = place.allergy_safety_note?.trim();
  if (need && place.allergy_needs?.includes(need) && note) {
    const head = safetyTierLabel(place.allergy_safety_tier);
    // First sentence of note as the tip line
    const short = note.split(/(?<=\.)\s+/)[0] ?? note;
    return `${head}: ${short}`;
  }
  if (note && place.allergy_safety_tier !== "unknown") {
    return note.split(/(?<=\.)\s+/)[0] ?? note;
  }
  return null;
}

function cuisineMatchBonus(cuisine: string[], query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  if (!tokens.length) return 0;
  let hit = 0;
  for (const c of cuisine) {
    const cl = c.toLowerCase();
    if (tokens.some((t) => cl.includes(t) || t.includes(cl))) hit += 1;
  }
  if (hit === 0) {
    // Soft penalty so a "pizza" search doesn't lead with a GF bakery when
    // curated GF pizza options exist — still keep them in Also nearby.
    return -8;
  }
  return Math.min(42, 20 + hit * 12);
}

function distanceScore(meters: number): number {
  const miles = meters / 1609.34;
  return Math.max(0, 40 - miles * 8);
}

function tierScore(status: string): number {
  if (status === "verified") return 28;
  if (status === "menu_indexed") return 16;
  return 0;
}

function allergyScore(
  place: RankablePlace,
  need?: string | null,
): { points: number; matches: boolean } {
  if (!need) {
    // Mild preference for curated profiles even without a filter
    if (place.allergy_safety_tier === "dedicated") return { points: 8, matches: false };
    if (place.allergy_safety_tier === "strong_protocol") return { points: 4, matches: false };
    return { points: 0, matches: false };
  }
  const matches = (place.allergy_needs ?? []).includes(need);
  if (!matches) return { points: -55, matches: false };
  if (place.allergy_safety_tier === "dedicated") return { points: 55, matches: true };
  if (place.allergy_safety_tier === "strong_protocol") return { points: 38, matches: true };
  if (place.allergy_safety_tier === "shared_verify") return { points: 18, matches: true };
  return { points: 5, matches: true };
}

export function scorePlace(
  place: RankablePlace,
  opts: {
    query?: string;
    now?: Date;
    timeZone?: string;
    need?: string | null;
    openNowOnly?: boolean;
  } = {},
): {
  score: number;
  breakdown: Record<string, number>;
  hours: HoursStatus;
  is_chain: boolean;
  matches_need: boolean;
  drop: boolean;
} {
  const hours = evaluateOpeningHours(place.opening_hours, {
    now: opts.now,
    timeZone: opts.timeZone,
  });
  const is_chain = isMegaChain(place.name);
  const breakdown: Record<string, number> = {};

  if (opts.openNowOnly && hours.open_now === false) {
    return {
      score: -9999,
      breakdown: { open_now_filter: -9999 },
      hours,
      is_chain,
      matches_need: false,
      drop: true,
    };
  }

  breakdown.distance = distanceScore(place.distance_meters);
  breakdown.tier = tierScore(place.verification_status);
  breakdown.phone = place.phone?.trim() ? 12 : 0;
  breakdown.website = place.website_url?.trim() ? 8 : 0;
  breakdown.address = place.address?.trim() ? 6 : 0;
  breakdown.has_hours = place.opening_hours?.trim() ? 10 : 0;

  if (hours.open_now === true) breakdown.open_now = 16;
  else if (hours.open_now === false) breakdown.open_now = -18;
  else breakdown.open_now = opts.openNowOnly ? -6 : 0;

  breakdown.cuisine = cuisineMatchBonus(place.cuisine_type ?? [], opts.query ?? "");
  breakdown.menu = place.menu_available ? 6 : 0;

  const allergy = allergyScore(place, opts.need);
  breakdown.allergy = allergy.points;

  // Vague / placeholder addresses are weaker tips
  if (place.address && /verify (current |nearest )?address/i.test(place.address)) {
    breakdown.address_quality = -12;
  }

  // Harder chain penalty when a dietary need is active — uncurated chains are noise.
  if (opts.need && is_chain && !allergy.matches) {
    breakdown.chain = -60;
  } else {
    breakdown.chain = is_chain ? -14 : 0;
  }

  // Drop unmatched mega-chains entirely when filtering by need
  if (opts.need && is_chain && !allergy.matches) {
    return {
      score: -9999,
      breakdown: { ...breakdown, chain_drop: -9999 },
      hours,
      is_chain,
      matches_need: false,
      drop: true,
    };
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return {
    score,
    breakdown,
    hours,
    is_chain,
    matches_need: allergy.matches,
    drop: false,
  };
}

export function rankPlaces(
  places: RankablePlace[],
  opts: {
    query?: string;
    now?: Date;
    timeZone?: string;
    need?: string | null;
    openNowOnly?: boolean;
    limit?: number;
  } = {},
): RankedPlace[] {
  const limit = opts.limit ?? 8;
  const scored: RankedPlace[] = [];

  for (const p of places) {
    const { score, breakdown, hours, is_chain, matches_need, drop } = scorePlace(p, opts);
    if (drop) continue;
    scored.push({
      ...p,
      ...hours,
      score,
      score_breakdown: breakdown,
      is_chain,
      is_top_pick: false,
      distance_miles: Math.round((p.distance_meters / 1609.34) * 10) / 10,
      matches_need,
      why: buildWhy(p, opts.need),
    });
  }

  // When a need is set, curated matches first; then by score
  scored.sort((a, b) => {
    if (opts.need) {
      if (a.matches_need !== b.matches_need) return a.matches_need ? -1 : 1;
    }
    if (b.score !== a.score) return b.score - a.score;
    return a.distance_meters - b.distance_meters;
  });

  let pool = scored;
  if (opts.need) {
    const curated = scored.filter((p) => p.matches_need);
    // Prefer an allergy-relevant list: if we have curated hits, don't pad with
    // uncurated local pizza/cafes (Rey's, random OSM) — keep Also nearby on-need.
    if (curated.length >= 1) {
      pool = curated;
    } else {
      // No curated hits — allow non-chain fillers only (chains already dropped)
      pool = scored.filter((p) => !p.is_chain);
    }
  }

  const top = pool.slice(0, limit);
  if (top[0]) {
    top[0].is_top_pick = true;
    if (opts.need && !top[0].why) {
      top[0].why =
        "No curated allergy matches nearby — showing listed places only. Confirm every dietary need with the restaurant.";
    }
  }
  return top;
}
