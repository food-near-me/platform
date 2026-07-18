/**
 * Shapes a neighborhood page's restaurant rows into two honest buckets:
 *   - `curated`: places carrying a real curated allergy tier (dedicated /
 *     strong_protocol / shared_verify). ONLY these count toward the safe-spot
 *     headline and may show a safety pill.
 *   - `other`: everything else, shown tier-neutral ("not vetted"). An `unknown`
 *     (or null / unexpected) tier can NEVER land in `curated` — the same
 *     `ogTierBadge` whitelist that governs ranking and the OG badge governs it
 *     here, so a scraped OSM row can't masquerade as a vetted safe spot.
 *
 * Pure and DB-free so the honesty invariant is unit-testable without a database.
 */

import { isMegaChain, ogTierBadge } from "@/lib/near-me/rank";

export type NeighborhoodRow = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  allergy_needs: string[] | null;
  allergy_safety_tier: string | null;
  allergy_safety_note: string | null;
  distance_miles: number;
};

export type NeighborhoodListing = {
  /** Curated safe spots, best tier first. Drives the headline count. */
  curated: NeighborhoodRow[];
  /** Uncurated nearby places, shown tier-neutral (no safety claim). */
  other: NeighborhoodRow[];
  /** Headline number — curated rows ONLY, never the uncurated ones. */
  curatedCount: number;
};

const TIER_ORDER: Record<string, number> = {
  dedicated: 0,
  strong_protocol: 1,
  shared_verify: 2,
};

export function buildNeighborhoodListing(
  rows: NeighborhoodRow[],
  opts: { otherLimit?: number } = {},
): NeighborhoodListing {
  const otherLimit = opts.otherLimit ?? 12;

  // A row is curated iff ogTierBadge returns a label — the single source of
  // truth for "this tier is a real safety claim". Anything else is tier-neutral.
  const curated = rows
    .filter((r) => ogTierBadge(r.allergy_safety_tier) !== undefined)
    .sort(
      (a, b) =>
        (TIER_ORDER[a.allergy_safety_tier ?? ""] ?? 3) -
        (TIER_ORDER[b.allergy_safety_tier ?? ""] ?? 3),
    );

  const other = rows
    .filter((r) => ogTierBadge(r.allergy_safety_tier) === undefined)
    .filter((r) => !isMegaChain(r.name)) // uncurated chains are noise, not a tip
    .slice(0, otherLimit);

  return { curated, other, curatedCount: curated.length };
}
