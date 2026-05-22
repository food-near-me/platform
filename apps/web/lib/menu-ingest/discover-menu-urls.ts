import { scoreDeliveryPlatformUrl } from "./delivery-platform-urls";

const ORDER_PLATFORM_PATTERN =
  /(?:getsauce|toasttab|getbento|bentobox|chownow|olo|popmenu|spotapps|menufy|gloriafood|square\.site|squareup|ubereats|postmates|doordash|grubhub|seamless)\.com|tmt\.spotapps\.co|order\.online/i;

const MENU_PATH_PATTERN =
  /\/(?:menu|menus|menu-2|food|dining|eat|brunch|lunch|dinner|food-menu|order-online|drinks|beverages|cocktails|wine|our-menu|order)(?:\/|$|[-_?])/i;

const MENU_QUERY_PATH =
  /\/menu\/(?:locations|categories|items)(?:\/|$|\?)/i;

const NAV_MENU_KEYWORDS =
  /(?:^|\/)(?:menu|menus|food|drinks|dining|eat|order|brunch|lunch|dinner|beverages|cocktails|wine|our-menu)(?:\/|$)/i;

function normalizeDiscoveredUrl(
  href: string,
  pageUrl: string,
  preserveQuery = false,
): string | null {
  try {
    const resolved = new URL(href, pageUrl);
    resolved.hash = "";
    if (!preserveQuery && !MENU_QUERY_PATH.test(resolved.pathname + resolved.search)) {
      resolved.search = "";
    }
    if (isAssetPath(resolved.pathname)) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function isUsefulMenuUrl(url: string, base: URL): boolean {
  if (url.includes("#")) return false;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== base.origin) {
      return ORDER_PLATFORM_PATTERN.test(parsed.hostname);
    }
    return (
      MENU_PATH_PATTERN.test(parsed.pathname) ||
      MENU_QUERY_PATH.test(parsed.pathname + parsed.search) ||
      NAV_MENU_KEYWORDS.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function isAssetPath(pathname: string): boolean {
  return (
    /\.(pdf|jpg|jpeg|png|gif|webp|css|js|svg|woff2?|ico)$/i.test(pathname) ||
    /\/wp-content\//i.test(pathname) ||
    /\/assets\//i.test(pathname) ||
    /\/favicon/i.test(pathname)
  );
}

function isJunkHref(href: string): boolean {
  if (href.startsWith("#")) return true;
  if (/[);%7D]|background-|mega-menu/i.test(href)) return true;
  if (/get\.chownow\.com/i.test(href)) return true;
  if (/stripe\.(com|network)|js\.stripe/i.test(href)) return true;
  return false;
}

/**
 * Pull same-origin menu paths and third-party order URLs from a fetched page.
 */
export function discoverMenuUrlsFromHtml(
  html: string,
  pageUrl: string,
  options?: { preserveQuery?: boolean },
): string[] {
  const found: string[] = [];

  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return found;
  }

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (isJunkHref(href)) continue;

    const normalized = normalizeDiscoveredUrl(href, pageUrl, options?.preserveQuery);
    if (!normalized || !isUsefulMenuUrl(normalized, base)) continue;
    found.push(normalized);
  }

  for (const match of html.matchAll(/href=["']([^"']+\.pdf[^"']*)["']/gi)) {
    const href = match[1]?.trim();
    if (!href || !/menu|food|dining|drink|wine|lunch|dinner/i.test(href)) continue;
    const normalized = normalizeDiscoveredUrl(href, pageUrl, options?.preserveQuery);
    if (normalized) found.push(normalized);
  }

  return [...new Set(found)];
}

export function scoreDiscoveredMenuUrl(url: string): number {
  let score = 0;
  try {
    const { pathname, hostname } = new URL(url);
    if (MENU_PATH_PATTERN.test(pathname)) score += 20;
    if (/food-menu|-food-menu|\/menu$/i.test(pathname)) score += 15;
    if (/\/(?:drinks|cocktails|wine|beverages)(?:\/|$)/i.test(pathname)) score += 12;
    if (/williamsburg|brooklyn|location|store/i.test(pathname)) score += 5;
    if (ORDER_PLATFORM_PATTERN.test(hostname)) score += 12;
    if (hostname.includes("order.online")) score += 40;
    if (hostname.includes("toasttab.com")) score += 25;
    if (hostname.includes("spotapps.co") && pathname.includes("ordering-menu")) score += 30;
    if (/ordering\.chownow\.com\/order\/\d+\/locations/i.test(url)) score -= 25;
    score += scoreDeliveryPlatformUrl(url);
    if (pathname.split("/").filter(Boolean).length <= 3) score += 3;
  } catch {
    score -= 10;
  }
  return score;
}

export function mergeProbeUrls(primary: string[], discovered: string[]): string[] {
  const ordered: string[] = [];
  const push = (url: string) => {
    if (url && !ordered.includes(url)) ordered.push(url);
  };

  for (const url of primary) push(url);

  const rankedDiscovered = [...discovered].sort(
    (a, b) => scoreDiscoveredMenuUrl(b) - scoreDiscoveredMenuUrl(a),
  );
  for (const url of rankedDiscovered) push(url);

  return ordered;
}
