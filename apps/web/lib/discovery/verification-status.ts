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
