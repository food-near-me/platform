import { normalizeChowNowProbeUrl } from "./fetch-chownow-menu";
import {
  discoverDeliveryPlatformUrlsFromHtml,
  normalizeDeliveryPlatformUrl,
} from "./delivery-platform-urls";
import { normalizeWebsiteUrl } from "./website-candidates";

const PLATFORM_HOST =
  /(?:getsauce|toasttab|getbento|bentobox|chownow|olo|popmenu|spotapps|menufy|gloriafood|square\.site|squareup|ubereats|postmates|doordash|grubhub|seamless)\.com|tmt\.spotapps\.co|order\.online/i;

/** Extract third-party menu / order URLs embedded in HTML. */
export function discoverPlatformUrlsFromHtml(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  const origin = safeOrigin(pageUrl);

  for (const match of html.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    const raw = match[0].replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
    if (!PLATFORM_HOST.test(raw)) continue;
    try {
      const url = new URL(raw);
      if (/\.(png|jpg|jpeg|gif|webp|css|js|svg|woff2?)$/i.test(url.pathname)) continue;
      found.push(url.toString());
    } catch {
      // ignore
    }
  }

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("#")) continue;
    if (/[);%7D]|get\.chownow\.com/i.test(href)) continue;
    try {
      const resolved = new URL(href, pageUrl);
      if (/\.(png|jpg|jpeg|gif|webp|css|js|svg|woff2?|ico)$/i.test(resolved.pathname)) continue;
      if (/\/wp-content\//i.test(resolved.pathname)) continue;
      resolved.hash = "";
      if (PLATFORM_HOST.test(resolved.hostname)) {
        found.push(resolved.toString());
      }
      if (origin && resolved.origin === origin && /food-menu|order-online|\/menu\b/i.test(resolved.pathname)) {
        found.push(resolved.toString());
      }
    } catch {
      // ignore
    }
  }

  const spotId = html.match(/spot_id[=:"'\s]+(\d{4,})/i)?.[1];
  if (spotId) {
    found.push(`https://tmt.spotapps.co/ordering-menu/?spot_id=${spotId}`);
  }

  for (const match of html.matchAll(/toasttab\.com\/([a-z0-9-]+)/gi)) {
    const slug = match[1];
    if (slug && !["giftcards", "local", "order"].includes(slug.toLowerCase())) {
      found.push(`https://www.toasttab.com/${slug}`);
    }
  }

  found.push(...discoverDeliveryPlatformUrlsFromHtml(html, pageUrl));

  return [...new Set(found)];
}

export function buildSauceMenuUrl(platformUrl: string): string | null {
  try {
    const url = new URL(platformUrl);
    if (!url.hostname.includes("getsauce.com")) return null;
    if (url.pathname.includes("/order/")) return platformUrl;
    const slugMatch = url.pathname.match(/\/([^/]+)\/menu/);
    if (slugMatch) {
      return `https://${url.hostname}/order/${slugMatch[1]}/menu`;
    }
    return platformUrl;
  } catch {
    return null;
  }
}

export function normalizePlatformProbeUrls(urls: string[]): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    const normalized = normalizeWebsiteUrl(raw);
    if (!normalized) continue;
    if (/chownow\.com/i.test(normalized)) {
      out.push(normalizeChowNowProbeUrl(normalized));
      continue;
    }
    const delivery = normalizeDeliveryPlatformUrl(normalized);
    if (delivery) {
      out.push(delivery);
      continue;
    }
    const sauce = buildSauceMenuUrl(normalized);
    out.push(sauce ?? normalized);
  }
  return [...new Set(out)];
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
