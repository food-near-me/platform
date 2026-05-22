/** Third-party delivery listings — discovery only (no paid scrapers). */

export type DeliveryPlatform =
  | "uber_eats"
  | "doordash"
  | "grubhub"
  | "postmates"
  | "unknown";

const DELIVERY_URL_PATTERN =
  /https?:\/\/(?:www\.)?(?:ubereats|postmates)\.com\/store\/[^\s"'<>]+|https?:\/\/(?:www\.)?doordash\.com\/store\/[^\s"'<>]+|https?:\/\/(?:www\.)?(?:grubhub|seamless)\.com\/restaurant\/[^\s"'<>]+/gi;

const HREF_DELIVERY_HOST =
  /(?:ubereats|postmates)\.com|doordash\.com|(?:grubhub|seamless)\.com/i;

const STORE_PATH =
  /\/(?:store|restaurant)\/[^/?#]+/i;

function decodeHtmlUrl(raw: string): string {
  return raw.replace(/\\u0026/g, "&").replace(/&amp;/g, "&").trim();
}

export function classifyDeliveryPlatformUrl(url: string): DeliveryPlatform | null {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.toLowerCase();
    if (host.includes("ubereats.com")) return "uber_eats";
    if (host.includes("postmates.com")) return "postmates";
    if (host.includes("doordash.com") && pathname.includes("/store/")) {
      return "doordash";
    }
    if (host.includes("grubhub.com") || host.includes("seamless.com")) {
      return "grubhub";
    }
  } catch {
    return null;
  }
  return null;
}

export function isDeliveryPlatformUrl(url: string): boolean {
  return classifyDeliveryPlatformUrl(url) !== null;
}

/** Canonical store URL without tracking query params. */
export function normalizeDeliveryPlatformUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const platform = classifyDeliveryPlatformUrl(parsed.toString());
    if (!platform) return null;
    if (!STORE_PATH.test(parsed.pathname)) return null;

    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.replace(/^www\./i, "");
    if (platform === "uber_eats" || platform === "postmates") {
      parsed.hostname = platform === "postmates" ? "postmates.com" : "ubereats.com";
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function deliveryPlatformLabel(url: string): string {
  const platform = classifyDeliveryPlatformUrl(url);
  switch (platform) {
    case "uber_eats":
      return "uber_eats";
    case "postmates":
      return "postmates";
    case "doordash":
      return "doordash";
    case "grubhub":
      return "grubhub";
    default:
      return "delivery";
  }
}

export function scoreDeliveryPlatformUrl(url: string): number {
  const platform = classifyDeliveryPlatformUrl(url);
  if (!platform) return 0;
  let score = 14;
  if (platform === "uber_eats") score += 4;
  if (/williamsburg|brooklyn|ny-/i.test(url)) score += 3;
  return score;
}

/**
 * Extract Uber Eats, DoorDash, Grubhub/Seamless, Postmates store URLs from HTML.
 * Works on static HTML and Playwright-rendered pages.
 */
export function discoverDeliveryPlatformUrlsFromHtml(
  html: string,
  pageUrl?: string,
): string[] {
  const found: string[] = [];

  for (const match of html.matchAll(DELIVERY_URL_PATTERN)) {
    const normalized = normalizeDeliveryPlatformUrl(decodeHtmlUrl(match[0]));
    if (normalized) found.push(normalized);
  }

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const resolved = decodeHtmlUrl(new URL(href, pageUrl ?? "https://example.com").toString());
      if (!HREF_DELIVERY_HOST.test(resolved)) continue;
      const normalized = normalizeDeliveryPlatformUrl(resolved);
      if (normalized) found.push(normalized);
    } catch {
      // ignore
    }
  }

  // Wix/Squarespace sometimes embed store slugs in JSON strings.
  for (const match of html.matchAll(
    /"(?:ubereats|postmates)\.com\/store\/([^"?\\]+)"/gi,
  )) {
    const slug = match[1]?.replace(/\\\/\//g, "/");
    if (!slug) continue;
    const normalized = normalizeDeliveryPlatformUrl(
      `https://www.ubereats.com/store/${slug}`,
    );
    if (normalized) found.push(normalized);
  }

  return [...new Set(found)];
}

export function summarizeDeliveryUrls(urls: string[]): string {
  const byPlatform = new Map<string, string>();
  for (const url of urls) {
    const label = deliveryPlatformLabel(url);
    if (!byPlatform.has(label)) byPlatform.set(label, url);
  }
  return [...byPlatform.entries()]
    .map(([label, url]) => `${label}: ${url}`)
    .join(" | ");
}
