/**
 * C4 — curated allergy-tier provenance gate.
 *
 * A curated safety tier (dedicated / strong_protocol / shared_verify) ships ONLY
 * when a curator has a fresh, well-formed source backing it. This is the honesty
 * keystone of the freshness loop: a tier is a claim, and a claim needs provenance
 * or it must not be published. The seed loader calls `evaluateTierProvenance` and
 * aborts (exit 1) on any curated place that fails — fail-closed, never a partial
 * write that ships an unsourced safety claim.
 *
 * Pure functions only (no process.exit, no I/O) so the gate is unit-testable and
 * so C6 can reuse the same tier_verified_at derivation. The `now` clock is always
 * passed in — deterministic tests, no ambient Date.
 */

export type CuratorSourceMethod = "call" | "visit" | "site" | "menu";

export type CuratorSource = {
  /** How the curator checked: phoned, visited, read the site, or read the menu. */
  method: CuratorSourceMethod;
  /** Optional citation URL (menu page, allergen statement, etc.). */
  url?: string;
  /** ISO timestamp the curator performed the check. */
  checked_at: string;
  /** Stable curator identifier (never end-user PII). */
  curator_id: string;
};

export type TierProvenanceInput = {
  name: string;
  allergy_safety_tier: string;
  sources?: CuratorSource[];
};

/** Tiers that make an affirmative safety claim and therefore require provenance. */
export const CURATED_TIERS: ReadonlySet<string> = new Set([
  "dedicated",
  "strong_protocol",
  "shared_verify",
]);

/**
 * C4 decision (2026-07-18): a curated tier's source must have been checked within
 * this window, or the tier is treated as stale and refused. See the plan's
 * decision #1 — 180 days (twice-a-year re-verification).
 */
export const SOURCE_STALE_DAYS = 180;

const MS_PER_DAY = 86_400_000;

function isWellFormed(s: CuratorSource | null | undefined): s is CuratorSource {
  return Boolean(s && s.curator_id && s.method && typeof s.checked_at === "string");
}

/**
 * Newest fresh, well-formed source check (ISO), or null if none qualifies.
 * A source is disqualified if it lacks curator_id/method/checked_at, is unparseable,
 * is future-dated, or is older than `staleDays`.
 */
export function newestFreshSource(
  sources: CuratorSource[] | undefined,
  nowIso: string,
  staleDays: number = SOURCE_STALE_DAYS,
): string | null {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return null;
  // Defensive: this runs over untrusted seed JSON in CI — a non-array `sources`
  // must degrade to "no source", never throw.
  const list = Array.isArray(sources) ? sources : [];
  let newest: number | null = null;
  for (const s of list) {
    if (!isWellFormed(s)) continue;
    const t = Date.parse(s.checked_at);
    if (!Number.isFinite(t)) continue;
    const ageDays = (now - t) / MS_PER_DAY;
    if (ageDays < 0 || ageDays > staleDays) continue; // future-dated or stale
    if (newest === null || t > newest) newest = t;
  }
  return newest === null ? null : new Date(newest).toISOString();
}

export type TierProvenanceVerdict =
  | { ok: true; tierVerifiedAt: string | null }
  | { ok: false; reason: string };

/**
 * Provenance verdict for one place.
 *  - 'unknown' tier: ok, tierVerifiedAt = null (nothing to verify).
 *  - curated tier with a fresh source: ok, tierVerifiedAt = max fresh checked_at.
 *  - curated tier with no fresh source: NOT ok (loader must abort).
 */
export function evaluateTierProvenance(
  place: TierProvenanceInput,
  nowIso: string,
  staleDays: number = SOURCE_STALE_DAYS,
): TierProvenanceVerdict {
  if (!CURATED_TIERS.has(place.allergy_safety_tier)) {
    return { ok: true, tierVerifiedAt: null };
  }
  const tierVerifiedAt = newestFreshSource(place.sources, nowIso, staleDays);
  if (!tierVerifiedAt) {
    return {
      ok: false,
      reason: `curated tier "${place.allergy_safety_tier}" needs a curator source checked within ${staleDays} days (method + curator_id + checked_at). None found.`,
    };
  }
  return { ok: true, tierVerifiedAt };
}
