/**
 * Centralized Cache-Control headers for the public read surface.
 *
 * Why centralize: keeping these values in one place makes it trivial
 * to audit cacheability decisions, ensures we never accidentally ship
 * `Cache-Control: private` (which would defeat CDN reuse), and lets
 * each endpoint share the same Vercel Edge / Cloudflare behavior.
 *
 * Tradeoff: we accept that owners promoting a new menu may see up to
 * `s-maxage` seconds of stale `menu_available` flags / signature
 * metadata at the edge. SWR keeps the user-perceived latency low while
 * the revalidation fans out.
 *
 * If a route emits per-user content (auth, paywall on the response
 * body itself), do NOT use these helpers — use Cache-Control: private,
 * no-store and revisit the architecture.
 */

/**
 * Search results — changes every time a restaurant is added or
 * promoted. Short edge cache, longer SWR so a single warm key
 * survives short bursts.
 */
export const SEARCH_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";

/**
 * Restaurant profile — basic metadata, dietary certifications,
 * and menu_available flag. A few minutes of staleness is fine;
 * the agent-facing copy explicitly says profiles are eventually
 * consistent.
 */
export const RESTAURANT_PROFILE_CACHE_CONTROL =
  "public, s-maxage=300, stale-while-revalidate=1800";

/**
 * Menu Protocol payload. Menus change rarely (owner-driven
 * verification flow). Five minutes is conservative; with SWR
 * agents see the cached menu instantly while the edge refreshes.
 */
export const MENU_CACHE_CONTROL =
  "public, s-maxage=300, stale-while-revalidate=3600";
