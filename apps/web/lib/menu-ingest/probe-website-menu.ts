import {
  discoverPlatformUrlsFromHtml,
  normalizePlatformProbeUrls,
} from "./platform-urls";
import {
  discoverMenuUrlsFromHtml,
  mergeProbeUrls,
  scoreDiscoveredMenuUrl,
} from "./discover-menu-urls";
import { fetchWebsiteHtmlStaticOptional } from "./fetch-website";
import {
  fetchChowNowMenuForUrl,
  isChowNowHost,
} from "./fetch-chownow-menu";
import { parseMenuForUrl, parseMenuFromVisibleText } from "./parse-menu-from-html";
import {
  discoverDeliveryPlatformUrlsFromHtml,
  summarizeDeliveryUrls,
} from "./delivery-platform-urls";
import { buildMenuProbeUrls, normalizeWebsiteUrl, isPlatformOrderingHost } from "./website-candidates";
import { isBlockedMenuUrl, filterMenuProbeUrls } from "./blocked-menu-urls";
import { isDeadOrPlaceholderSite } from "./site-health";
import type { ParsedMenuResult } from "./types";

export type MenuProbeOutcome = {
  parsed: ParsedMenuResult | null;
  matchedUrl: string | null;
  parser: string | null;
  fetchVia: "static" | "headless" | "api" | null;
  triedUrls: string[];
  discoveredUrls: string[];
  /** Uber Eats, DoorDash, Grubhub store links found on probed pages. */
  deliveryUrls: string[];
};

export type ProbeWebsiteOptions = {
  maxUrls?: number;
  /** Keep query strings on discovered menu URLs (some sites use ?page=menu). */
  preserveQueryOnDiscover?: boolean;
  verbose?: boolean;
  headless?: boolean;
  onAttempt?: (message: string) => void;
};

function siteOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isOrderOnlineHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("order.online");
  } catch {
    return /order\.online/i.test(url);
  }
}

async function tryPlatformApiMenu(
  url: string,
): Promise<{ parsed: ParsedMenuResult; parser: string } | null> {
  if (isChowNowHost(url)) {
    const parsed = await fetchChowNowMenuForUrl(url);
    if (parsed) return { parsed, parser: "chownow_api" };
  }
  return null;
}

async function fetchAndParseUrl(
  url: string,
  options: ProbeWebsiteOptions,
): Promise<{
  html: string | null;
  visibleText: string | null;
  parsed: ParsedMenuResult | null;
  parser: string | null;
  fetchVia: "static" | "headless" | "api" | null;
}> {
  const log = options.onAttempt ?? (() => {});

  if (isBlockedMenuUrl(url)) {
    if (options.verbose) log(`  … blocked URL ${url}`);
    return { html: null, visibleText: null, parsed: null, parser: null, fetchVia: null };
  }

  const apiMenu = await tryPlatformApiMenu(url);
  if (apiMenu) {
    if (options.verbose) log(`  … chownow API menu from ${url}`);
    return {
      html: null,
      visibleText: null,
      parsed: apiMenu.parsed,
      parser: apiMenu.parser,
      fetchVia: "api",
    };
  }

  const skipStatic = isOrderOnlineHost(url) && options.headless;
  const staticHtml = skipStatic
    ? null
    : await fetchWebsiteHtmlStaticOptional(url);
  let lastHtml: string | null = staticHtml;

  if (staticHtml) {
    const attempt = parseMenuForUrl(staticHtml, url);
    if (attempt.result && attempt.parser) {
      return {
        html: staticHtml,
        visibleText: null,
        parsed: attempt.result,
        parser: attempt.parser,
        fetchVia: "static",
      };
    }
  }

  if (options.headless) {
    if (options.verbose) {
      log(
        staticHtml
          ? `  … static HTML had no menu, trying headless ${url}`
          : `  … static fetch failed, trying headless ${url}`,
      );
    }
    const { fetchWebsiteWithPlaywright } = await import("./fetch-website-playwright");
    const rendered = await fetchWebsiteWithPlaywright(url);
    if (rendered) {
      lastHtml = rendered.html;
      let lastVisible = rendered.visibleText;
      const attempt = parseMenuForUrl(rendered.html, url);
      if (attempt.result && attempt.parser) {
        return {
          html: rendered.html,
          visibleText: rendered.visibleText,
          parsed: attempt.result,
          parser: attempt.parser,
          fetchVia: "headless",
        };
      }
      const textAttempt = parseMenuFromVisibleText(rendered.visibleText);
      if (textAttempt.result && textAttempt.parser) {
        return {
          html: rendered.html,
          visibleText: rendered.visibleText,
          parsed: textAttempt.result,
          parser: textAttempt.parser,
          fetchVia: "headless",
        };
      }
      return {
        html: lastHtml,
        visibleText: lastVisible,
        parsed: null,
        parser: null,
        fetchVia: "headless",
      };
    }
  }

  return {
    html: lastHtml,
    visibleText: null,
    parsed: null,
    parser: null,
    fetchVia: lastHtml
      ? lastHtml === staticHtml
        ? "static"
        : "headless"
      : null,
  };
}

function collectDeliveryFromHtml(
  deliveryUrls: string[],
  html: string,
  pageUrl: string,
): void {
  deliveryUrls.push(...discoverDeliveryPlatformUrlsFromHtml(html, pageUrl));
}

function finalizeProbe(
  partial: Omit<MenuProbeOutcome, "deliveryUrls"> & {
    deliveryUrls?: string[];
  },
): MenuProbeOutcome {
  return {
    ...partial,
    deliveryUrls: [...new Set(partial.deliveryUrls ?? [])],
    discoveredUrls: [...new Set(partial.discoveredUrls)],
  };
}

export async function probeWebsiteForMenu(
  websiteUrl: string,
  options: ProbeWebsiteOptions = {},
): Promise<MenuProbeOutcome> {
  const maxUrls = options.maxUrls ?? 16;
  const log = options.onAttempt ?? (() => {});

  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) {
    return finalizeProbe({
      parsed: null,
      matchedUrl: null,
      parser: null,
      fetchVia: null,
      triedUrls: [],
      discoveredUrls: [],
      deliveryUrls: [],
    });
  }

  const origin = siteOrigin(normalized);
  const discoveredUrls: string[] = [];
  const deliveryUrls: string[] = [];
  const triedUrls: string[] = [];
  let queue: string[] = [];

  const isPlatformEntry = normalized ? isPlatformOrderingHost(normalized) : false;

  if (isPlatformEntry && normalized) {
    triedUrls.push(normalized);
    const direct = await fetchAndParseUrl(normalized, options);
    if (direct.parsed && direct.parser) {
      return finalizeProbe({
        parsed: direct.parsed,
        matchedUrl: normalized,
        parser: direct.parser,
        fetchVia: direct.fetchVia,
        triedUrls,
        discoveredUrls,
        deliveryUrls,
      });
    }
  }

  const seedUrl = origin ? `${origin}/` : null;

  if (normalized && normalized !== seedUrl && /\/menu\b/i.test(normalized)) {
    triedUrls.push(normalized);
    const menuFirst = await fetchAndParseUrl(normalized, options);
    if (menuFirst.parsed && menuFirst.parser) {
      return finalizeProbe({
        parsed: menuFirst.parsed,
        matchedUrl: normalized,
        parser: menuFirst.parser,
        fetchVia: menuFirst.fetchVia,
        triedUrls,
        discoveredUrls,
        deliveryUrls,
      });
    }
  }

  if (seedUrl) {
    triedUrls.push(seedUrl);
    const seed = await fetchAndParseUrl(seedUrl, options);
    if (seed.html) {
      collectDeliveryFromHtml(deliveryUrls, seed.html, seedUrl);
      discoveredUrls.push(
        ...discoverPlatformUrlsFromHtml(seed.html, seedUrl),
        ...discoverMenuUrlsFromHtml(seed.html, seedUrl, {
          preserveQuery: options.preserveQueryOnDiscover,
        }),
      );
    }

    const homepageText =
      seed.visibleText ?? seed.html?.replace(/<[^>]+>/g, " ").slice(0, 800) ?? "";
    const jsHeavyHomepage =
      seed.fetchVia === "headless" && (seed.visibleText?.length ?? 0) > 200;

    if (!seed.parsed && seed.html && !jsHeavyHomepage && isDeadOrPlaceholderSite(seed.html, homepageText)) {
      if (options.verbose) log(`  … homepage looks dead/placeholder — skipping deep probe`);
      return finalizeProbe({
        parsed: null,
        matchedUrl: null,
        parser: null,
        fetchVia: seed.fetchVia,
        triedUrls,
        discoveredUrls,
        deliveryUrls,
      });
    }

    if (options.verbose && discoveredUrls.length > 0) {
      log(`  discovered ${discoveredUrls.length} menu/platform URL(s) from homepage`);
    }
    if (options.verbose && deliveryUrls.length > 0) {
      log(`  delivery listing(s): ${summarizeDeliveryUrls(deliveryUrls)}`);
    }

    if (seed.parsed && seed.parser) {
      return finalizeProbe({
        parsed: seed.parsed,
        matchedUrl: seedUrl,
        parser: seed.parser,
        fetchVia: seed.fetchVia,
        triedUrls,
        discoveredUrls,
        deliveryUrls,
      });
    }

    queue = filterMenuProbeUrls(
      [
        ...normalizePlatformProbeUrls(discoveredUrls),
        ...mergeProbeUrls(buildMenuProbeUrls(normalized), []),
      ]
        .filter((url) => url !== seedUrl)
        .sort((a, b) => scoreDiscoveredMenuUrl(b) - scoreDiscoveredMenuUrl(a)),
    );
    if (normalized !== seedUrl && !queue.includes(normalized)) {
      queue.unshift(normalized);
    }
  } else {
    queue = filterMenuProbeUrls(mergeProbeUrls(buildMenuProbeUrls(normalized), []));
    if (normalized) queue.unshift(normalized);
  }

  const queued = new Set<string>();

  while (queue.length > 0 && triedUrls.length < maxUrls) {
    const url = queue.shift();
    if (!url || triedUrls.includes(url) || queued.has(url) || isBlockedMenuUrl(url)) continue;
    queued.add(url);
    triedUrls.push(url);

    const result = await fetchAndParseUrl(url, options);
    if (!result.html && !result.parsed) {
      if (options.verbose) log(`  … fetch failed ${url}`);
      continue;
    }

    if (result.html) {
      collectDeliveryFromHtml(deliveryUrls, result.html, url);
      const platformLinks = discoverPlatformUrlsFromHtml(result.html, url);
      const menuLinks = discoverMenuUrlsFromHtml(result.html, url, {
        preserveQuery: options.preserveQueryOnDiscover,
      });
      discoveredUrls.push(...platformLinks, ...menuLinks);

      if (options.verbose && !result.parsed) log(`  … no menu on ${url}`);

      for (const next of filterMenuProbeUrls(
        normalizePlatformProbeUrls([...platformLinks, ...menuLinks]).sort(
          (a, b) => scoreDiscoveredMenuUrl(b) - scoreDiscoveredMenuUrl(a),
        ),
      )) {
        if (!queued.has(next) && !triedUrls.includes(next)) queue.unshift(next);
      }
    } else if (options.verbose && !result.parsed) {
      log(`  … no menu on ${url}`);
    }

    if (result.parsed && result.parser) {
      return finalizeProbe({
        parsed: result.parsed,
        matchedUrl: url,
        parser: result.parser,
        fetchVia: result.fetchVia,
        triedUrls,
        discoveredUrls,
        deliveryUrls,
      });
    }
  }

  return finalizeProbe({
    parsed: null,
    matchedUrl: null,
    parser: null,
    fetchVia: null,
    triedUrls,
    discoveredUrls,
    deliveryUrls,
  });
}

export function formatProbeAttempts(triedUrls: string[]): string {
  if (triedUrls.length === 0) return "";
  const preview = triedUrls.slice(0, 4).join(", ");
  const extra = triedUrls.length > 4 ? ` (+${triedUrls.length - 4} more)` : "";
  return `${preview}${extra}`;
}
