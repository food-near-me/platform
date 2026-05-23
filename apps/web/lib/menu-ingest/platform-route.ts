import { discoverPlatformUrlsFromHtml, normalizePlatformProbeUrls } from "./platform-urls";
import { scoreDiscoveredMenuUrl } from "./discover-menu-urls";
import { filterMenuProbeUrls } from "./blocked-menu-urls";
import { fetchWebsiteHtmlStaticOptional } from "./fetch-website";
import { isPlatformOrderingHost, normalizeWebsiteUrl } from "./website-candidates";

export type PlatformKind =
  | "toast"
  | "order_online"
  | "square"
  | "chownow"
  | "bentobox"
  | "spotapps"
  | "sauce"
  | "unknown";

export function detectPlatformFromUrl(url: string): PlatformKind {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("toasttab.com")) return "toast";
    if (host.includes("order.online")) return "order_online";
    if (host.includes("square.site") || host.includes("squareup.com")) return "square";
    if (host.includes("chownow.com")) return "chownow";
    if (host.includes("getbento.com") || host.includes("bentobox")) return "bentobox";
    if (host.includes("spotapps.co")) return "spotapps";
    if (host.includes("getsauce.com")) return "sauce";
  } catch {
    // ignore
  }
  return "unknown";
}

/**
 * URLs to probe before generic /menu path discovery.
 * Uses stored website URL + optional static homepage HTML.
 */
export function priorityPlatformProbeUrls(
  websiteUrl: string,
  homepageHtml?: string | null,
  maxUrls = 6,
): string[] {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) return [];

  const found: string[] = [];

  if (isPlatformOrderingHost(normalized)) {
    found.push(normalized);
  }

  if (homepageHtml) {
    found.push(...discoverPlatformUrlsFromHtml(homepageHtml, normalized));
  }

  return filterMenuProbeUrls(
    normalizePlatformProbeUrls(found)
      .sort((a, b) => scoreDiscoveredMenuUrl(b) - scoreDiscoveredMenuUrl(a))
      .slice(0, maxUrls),
  );
}

/** Fast static homepage scan to bucket candidates for platform batch runs. */
export async function classifyCandidatePlatform(websiteUrl: string): Promise<PlatformKind> {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) return "unknown";

  const direct = detectPlatformFromUrl(normalized);
  if (direct !== "unknown") return direct;

  const staticHtml = await fetchWebsiteHtmlStaticOptional(normalized);
  if (!staticHtml) return "unknown";

  for (const url of discoverPlatformUrlsFromHtml(staticHtml, normalized)) {
    const kind = detectPlatformFromUrl(url);
    if (kind !== "unknown") return kind;
  }

  return "unknown";
}
