/** Human-readable labels for consumer allergy UI. */

export const NEED_LABELS: Record<string, string> = {
  gluten_free: "Gluten / Celiac",
  dairy_free: "Dairy",
  nut_aware: "Nuts",
  vegetarian: "Vegetarian",
};

export function needLabel(need: string): string {
  return NEED_LABELS[need] ?? need.replace(/_/g, " ");
}

export function formatNeedTags(needs: string[] | null | undefined): string[] {
  if (!needs?.length) return [];
  return needs.map(needLabel);
}

export const TIER_BLURB: Record<string, string> = {
  dedicated:
    "Kitchen/facility is built to avoid that allergen structurally (e.g. 100% GF). Still confirm day-of — staff and recipes change.",
  strong_protocol:
    "Trained staff / marked menu / better-than-average protocols, but a SHARED kitchen. Residual cross-contact risk remains.",
  shared_verify:
    "Possible options in a shared kitchen. Call ahead. Higher risk for highly sensitive diners.",
  unknown: "We have not curated an allergy note for this listing yet.",
};

export function tierBlurb(tier: string): string {
  return TIER_BLURB[tier] ?? TIER_BLURB.unknown;
}

/**
 * Label for a listing's owner-driven status (shared by API + place page).
 *
 * C8: 'verified'/'menu_indexed' are OWNER-submitted states — the owner put their
 * menu on file. They are NOT a curated allergy-safety judgment, so we label them
 * plainly ("menu on file (owner-submitted)") and give them no rank boost (see
 * rank.ts). The bare word "verified" must never surface to a consumer, where it
 * could read as a safety guarantee. Allergy safety lives only in the separate,
 * curator-driven allergy_safety_tier.
 */
export function trustLabel(status: string): string {
  if (status === "verified" || status === "menu_indexed") {
    return "menu on file (owner-submitted)";
  }
  return "listed";
}
