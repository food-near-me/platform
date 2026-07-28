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

const ALL_TIERS: readonly AllergySafetyTier[] = [
  "dedicated",
  "strong_protocol",
  "shared_verify",
  "unknown",
];

/** Runtime guard so a stray DB value can't masquerade as a valid tier. */
export function isAllergySafetyTier(value: unknown): value is AllergySafetyTier {
  return (ALL_TIERS as readonly string[]).includes(String(value));
}

/** Pickup-only / no-storefront spots are parked at the city centroid, so their
 * distance is meaningless — a placeholder pin must not win on fake proximity. */
const PICKUP_ONLY_RE = /pickup only|no walk-?in|order-ahead|order ahead/i;

export function isPickupOnly(place: Pick<RankablePlace, "address">): boolean {
  return PICKUP_ONLY_RE.test(place.address ?? "");
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

/**
 * Label for a surface that renders ONLY curated tiers (e.g. "curated nearby").
 * Fails loud instead of silently coercing an unexpected value to the "unknown"
 * label — a typo'd/fooled tier ("strong_protcol") must never render as a curated
 * safety pill. Callers on curated surfaces should use this, not safetyTierLabel.
 */
export function curatedTierLabel(tier: string): string {
  if (!(CURATED_TIERS as readonly string[]).includes(tier)) {
    throw new Error(
      `curatedTierLabel: refusing to label non-curated tier "${tier}" on a curated surface`,
    );
  }
  return safetyTierLabel(tier);
}

export function buildWhy(place: RankablePlace, need?: string | null | string[]): string | null {
  const needs = normalizeNeeds(need);
  const note = place.allergy_safety_note?.trim();
  const taggedForNeeds =
    needs.length > 0 && needs.every((n) => (place.allergy_needs ?? []).includes(n));
  if (taggedForNeeds && note) {
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

/** Normalize a single need, comma-list, or array into unique AllergyNeed ids. */
export function normalizeNeeds(need?: string | null | string[]): AllergyNeed[] {
  if (need == null) return [];
  const raw = Array.isArray(need) ? need : need.split(/[,+\s]+/);
  const out: AllergyNeed[] = [];
  for (const part of raw) {
    const v = part.trim().toLowerCase();
    if (!v) continue;
    if (isAllergyNeed(v) && !out.includes(v)) out.push(v);
  }
  return out;
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
  if (!Number.isFinite(meters)) return 0; // defensive: never let a bad distance poison the score
  const miles = meters / 1609.34;
  return Math.max(0, 40 - miles * 8);
}

/** Only explicitly curated tiers may match a dietary need — allergy safety is
 * human judgment, never an OSM/scrape tag. An `unknown` tier never matches. */
export const CURATED_TIERS: readonly AllergySafetyTier[] = [
  "dedicated",
  "strong_protocol",
  "shared_verify",
];

/** Share-card / OG badge text. A listing earns a tier badge ONLY when it carries
 * a real curated tier — the SAME whitelist that governs ranking. Unknown / null /
 * unexpected values return undefined so the caller omits the pill entirely; a
 * presentation surface must never fabricate curation for an uncurated listing. */
export function ogTierBadge(tier: string | null | undefined): string | undefined {
  return tier && (CURATED_TIERS as readonly string[]).includes(tier)
    ? safetyTierLabel(tier)
    : undefined;
}

function allergyScore(
  place: RankablePlace,
  need?: string | null | string[],
): { points: number; matches: boolean } {
  const needs = normalizeNeeds(need);
  if (needs.length === 0) {
    // Mild preference for curated profiles even without a filter
    if (place.allergy_safety_tier === "dedicated") return { points: 8, matches: false };
    if (place.allergy_safety_tier === "strong_protocol") return { points: 4, matches: false };
    return { points: 0, matches: false };
  }
  // AND semantics: tagged for EVERY selected need AND carry a real curated tier.
  // An `unknown` (or unexpected) tier never counts as a match.
  const tagged = needs.every((n) => (place.allergy_needs ?? []).includes(n));
  const matches =
    tagged && (CURATED_TIERS as readonly string[]).includes(place.allergy_safety_tier);
  if (!matches) return { points: -55, matches: false };
  if (place.allergy_safety_tier === "dedicated") return { points: 55, matches: true };
  if (place.allergy_safety_tier === "strong_protocol") return { points: 38, matches: true };
  return { points: 18, matches: true }; // shared_verify (only remaining curated tier)
}

export function scorePlace(
  place: RankablePlace,
  opts: {
    query?: string;
    now?: Date;
    timeZone?: string;
    /** Single need, comma-list, or multi-need array (AND). */
    need?: string | null | string[];
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
  const needs = normalizeNeeds(opts.need);
  const hasNeedFilter = needs.length > 0;

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

  breakdown.distance = isPickupOnly(place)
    ? 10 // neutral: judge on curation/tier, not a placeholder centroid pin
    : distanceScore(place.distance_meters);
  // C8: owner-driven verification_status ('verified'/'menu_indexed') earns NO
  // rank advantage — it means the owner put a menu on file, not that the kitchen
  // is allergy-safe. Only curated allergy tiers (allergyScore) and objective
  // signals (phone/site/hours/open) move rank. No `breakdown.tier`.
  breakdown.phone = place.phone?.trim() ? 12 : 0;
  breakdown.website = place.website_url?.trim() ? 8 : 0;
  breakdown.address = place.address?.trim() ? 6 : 0;
  breakdown.has_hours = place.opening_hours?.trim() ? 10 : 0;

  if (hours.open_now === true) breakdown.open_now = 16;
  else if (hours.open_now === false) breakdown.open_now = -18;
  else breakdown.open_now = opts.openNowOnly ? -6 : 0;

  breakdown.cuisine = cuisineMatchBonus(place.cuisine_type ?? [], opts.query ?? "");
  breakdown.menu = place.menu_available ? 6 : 0;

  const allergy = allergyScore(place, needs);
  breakdown.allergy = allergy.points;

  // Vague / placeholder addresses are weaker tips
  if (place.address && /verify (current |nearest )?address/i.test(place.address)) {
    breakdown.address_quality = -12;
  }

  // Harder chain penalty when a dietary need is active — uncurated chains are noise.
  if (hasNeedFilter && is_chain && !allergy.matches) {
    breakdown.chain = -60;
  } else {
    breakdown.chain = is_chain ? -14 : 0;
  }

  // Drop unmatched mega-chains entirely when filtering by need
  if (hasNeedFilter && is_chain && !allergy.matches) {
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
    /** Single need, comma-list, or multi-need array (AND). */
    need?: string | null | string[];
    openNowOnly?: boolean;
    limit?: number;
  } = {},
): RankedPlace[] {
  const limit = opts.limit ?? 8;
  const scored: RankedPlace[] = [];
  const needs = normalizeNeeds(opts.need);
  const hasNeedFilter = needs.length > 0;

  for (const p of places) {
    const { score, breakdown, hours, is_chain, matches_need, drop } = scorePlace(p, {
      ...opts,
      need: needs,
    });
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
      why: buildWhy(p, needs),
    });
  }

  // When a need is set, curated matches first; then by score
  scored.sort((a, b) => {
    if (hasNeedFilter) {
      if (a.matches_need !== b.matches_need) return a.matches_need ? -1 : 1;
    }
    if (b.score !== a.score) return b.score - a.score;
    return a.distance_meters - b.distance_meters;
  });

  let pool = scored;
  if (hasNeedFilter) {
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
    if (hasNeedFilter && !top[0].why) {
      top[0].why =
        "No curated allergy matches nearby — showing listed places only. Confirm every dietary need with the restaurant.";
    }
  }
  return top;
}
