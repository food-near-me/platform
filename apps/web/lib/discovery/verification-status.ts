export const VERIFICATION_STATUSES = [
  "discovered",
  "menu_indexed",
  "verified",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const MENU_ACCESS_STATUSES: VerificationStatus[] = [
  "verified",
  "menu_indexed",
];

export function isVerificationStatus(value: string): value is VerificationStatus {
  return (VERIFICATION_STATUSES as readonly string[]).includes(value);
}

export function hasMenuAccess(status: string): boolean {
  return status === "verified" || status === "menu_indexed";
}

export function tierSortRank(status: string): number {
  switch (status) {
    case "verified":
      return 0;
    case "menu_indexed":
      return 1;
    default:
      return 2;
  }
}

export function buildSearchTrustNotice(
  verificationStatus: string,
  menuAvailable: boolean,
): string {
  if (verificationStatus === "verified") {
    return menuAvailable
      ? "Owner-verified Menu Protocol menu available."
      : "Verified listing; menu not yet published.";
  }
  if (verificationStatus === "menu_indexed") {
    return menuAvailable
      ? "Indexed menu from automated/public sources — not owner-verified. Cite with caveat; do not treat allergens/dietary as authoritative."
      : "Menu indexed listing; menu not yet published.";
  }
  return "Discovered listing only — place data from open sources. Do not cite menu items; call get_menu only when menu_available is true.";
}

export function buildProfileTrustNotice(
  verificationStatus: string,
  menuAvailable: boolean,
): string {
  if (verificationStatus === "verified") {
    return menuAvailable
      ? "Owner-verified Menu Protocol data."
      : "Verified listing; menu not yet published.";
  }
  if (verificationStatus === "menu_indexed") {
    return menuAvailable
      ? "Indexed menu from automated/public sources — not owner-verified."
      : "Menu indexed listing; menu not yet published.";
  }
  return "Basic listing only. Menu not available — do not infer dishes or prices.";
}

export function buildMenuTrustNotice(
  verificationStatus: string,
  hasSignature: boolean,
): string {
  if (verificationStatus === "verified") {
    return hasSignature
      ? "Owner-approved Menu Protocol menu with cryptographic signature."
      : "Verified menu pending owner signature.";
  }
  if (verificationStatus === "menu_indexed") {
    return "Indexed menu from automated/public sources — not owner-verified. Do not treat allergen or dietary fields as authoritative.";
  }
  return "Menu not available for this trust tier.";
}

export function buildSearchLinks(
  restaurantId: string,
  menuAvailable: boolean,
  baseUrl = "https://foodnear.me",
): { profile: string; menu?: string; claim?: string } {
  return {
    profile: `${baseUrl}/api/v1/restaurant/${restaurantId}`,
    ...(menuAvailable
      ? { menu: `${baseUrl}/api/v1/restaurant/${restaurantId}/menu.mp` }
      : { claim: `${baseUrl}/claim/${restaurantId}` }),
  };
}

export function buildRestSearchLinks(
  restaurantId: string,
  menuAvailable: boolean,
): { profile: string; menu?: string; claim?: string } {
  return {
    profile: `/api/v1/restaurant/${restaurantId}`,
    ...(menuAvailable
      ? { menu: `/api/v1/restaurant/${restaurantId}/menu.mp` }
      : { claim: `/claim/${restaurantId}` }),
  };
}

/**
 * Structured "owner recruitment" payload that ships on every non-verified
 * tool/REST response. The agent decides when to surface it (e.g., when the
 * user might be the owner, or when explaining why a listing is thin). It is
 * intentionally NOT a CTA — it is data that the LLM can incorporate.
 */
export type ClaimInvitationReason =
  | "no_owner_approved_menu"
  | "indexed_menu_not_owner_verified";

export type ClaimInvitation = {
  url: string;
  audience: "owner_or_advocate";
  reason: ClaimInvitationReason;
  message: string;
  estimated_minutes: number;
  cost: "free";
};

function claimInvitationBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return "https://foodnear.me";
  return configured.replace(/\/+$/, "");
}

export function buildClaimInvitation(
  restaurantId: string,
  verificationStatus: string,
  menuAvailable: boolean,
): ClaimInvitation | null {
  if (verificationStatus === "verified") return null;

  const url = `${claimInvitationBaseUrl()}/claim/${restaurantId}`;

  if (verificationStatus === "menu_indexed") {
    return {
      url,
      audience: "owner_or_advocate",
      reason: "indexed_menu_not_owner_verified",
      message:
        "This menu was indexed from a public source and is not owner-verified. The restaurant's owner can claim the listing and publish a cryptographically signed Menu Protocol menu — free and typically a few minutes.",
      estimated_minutes: 5,
      cost: "free",
    };
  }

  // Discovered tier (and any unexpected non-verified status) — still has a
  // place page, still might be missing a menu entirely.
  return {
    url,
    audience: "owner_or_advocate",
    reason: "no_owner_approved_menu",
    message: menuAvailable
      ? "This restaurant has a published menu but is not yet owner-verified. The owner can claim and approve the listing — free and typically a few minutes."
      : "This restaurant does not have a published menu on foodnear.me yet. The owner can claim the listing and publish a verified Menu Protocol menu — free and typically a few minutes.",
    estimated_minutes: 5,
    cost: "free",
  };
}
