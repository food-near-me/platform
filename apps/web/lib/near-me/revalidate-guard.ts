/**
 * C7 — guard for the internal cache-purge route.
 *
 * The reseed POSTs the exact paths it wants revalidated. This route could
 * otherwise be turned into an arbitrary-path purge oracle, so the paths it will
 * act on are whitelisted to the two surfaces a reseed can affect: consumer place
 * pages and neighborhood (hood) pages. Everything else is refused, loudly.
 *
 * Pure functions only — unit-testable without a Next runtime.
 */

/** Only these route families may be revalidated by the internal endpoint. */
export const REVALIDATE_ALLOWED_PREFIXES = ["/place/", "/near-me/"] as const;

/**
 * A path is purgeable iff it is an absolute path under an allowed prefix with a
 * real segment after it, and contains no traversal / control characters. This is
 * an allowlist, not a denylist — an unrecognized shape is refused.
 */
export function isAllowedRevalidatePath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  if (path.includes("..") || path.includes("\\") || /[\r\n\0]/.test(path)) return false;
  return REVALIDATE_ALLOWED_PREFIXES.some(
    (prefix) => path.startsWith(prefix) && path.length > prefix.length,
  );
}

/** Extract the token from an `Authorization: Bearer <token>` header, or null. */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match ? match[1].trim() || null : null;
}
