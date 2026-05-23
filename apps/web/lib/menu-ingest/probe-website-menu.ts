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
import {
  cacheDeadSite,
  isSiteCachedDead,
  SITE_HEALTH_CACHE_TTL_DAYS,
} from "./site-health-cache";
import { priorityPlatformProbeUrls } from "./platform-route";
import type { ParsedMenuResult } from "./types";

/**
 * Default upper bound on how many candidate URLs run in parallel inside
 * a probe batch. Headless probes are memory-heavy so we cap them lower.
 * Override per-call with `options.probeBatchSize`.
 */
const STATIC_PROBE_BATCH_SIZE = 4;
const HEADLESS_PROBE_BATCH_SIZE = 2;

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
  /** Skip static HTTP fetch (caller already tried static HTML for this URL). */
  skipStaticFetch?: boolean;
  /**
   * How many candidate URLs to probe in parallel per batch. Defaults to
   * STATIC_PROBE_BATCH_SIZE (static) or HEADLESS_PROBE_BATCH_SIZE (headless).
   * Set to 1 to restore the legacy sequential behaviour.
   */
  probeBatchSize?: number;
  /**
   * Bypass the persistent dead-site cache. Pass true from refresh /
   * audit scripts that explicitly want to re-evaluate a previously
   * dead host. Defaults false: the cache is consulted.
   */
  bypassSiteHealthCache?: boolean;
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
  const showProgress = Boolean(options.onAttempt);

  if (isBlockedMenuUrl(url)) {
    if (options.verbose || showProgress) log(`  … blocked URL ${url}`);
    return { html: null, visibleText: null, parsed: null, parser: null, fetchVia: null };
  }

  if (showProgress) log(`  … trying ${url}`);

  const apiMenu = await tryPlatformApiMenu(url);
  if (apiMenu) {
    if (options.verbose || showProgress) log(`  … chownow API menu from ${url}`);
    return {
      html: null,
      visibleText: null,
      parsed: apiMenu.parsed,
      parser: apiMenu.parser,
      fetchVia: "api",
    };
  }

  const skipStatic = isOrderOnlineHost(url) && options.headless;
  const staticHtml = options.skipStaticFetch
    ? null
    : skipStatic
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
    if (options.verbose || showProgress) {
      log(
        staticHtml
          ? `  … static HTML had no menu, trying headless ${url}`
          : `  … headless ${url} (Chromium may take 30–60s on first load)`,
      );
    }
    const { fetchWebsiteWithPlaywright } = await import("./fetch-website-playwright");
    const rendered = await fetchWebsiteWithPlaywright(url);
    if (rendered) {
      lastHtml = rendered.html;
      const lastVisible = rendered.visibleText;
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

async function tryPlatformUrlsFirst(
  urls: string[],
  options: ProbeWebsiteOptions,
  state: {
    triedUrls: string[];
    discoveredUrls: string[];
    deliveryUrls: string[];
  },
): Promise<MenuProbeOutcome | null> {
  for (const url of urls) {
    if (state.triedUrls.includes(url) || isBlockedMenuUrl(url)) continue;
    state.triedUrls.push(url);

    const result = await fetchAndParseUrl(url, options);
    if (result.html) {
      collectDeliveryFromHtml(state.deliveryUrls, result.html, url);
      state.discoveredUrls.push(
        ...discoverPlatformUrlsFromHtml(result.html, url),
        ...discoverMenuUrlsFromHtml(result.html, url, {
          preserveQuery: options.preserveQueryOnDiscover,
        }),
      );
    }

    if (result.parsed && result.parser) {
      return finalizeProbe({
        parsed: result.parsed,
        matchedUrl: url,
        parser: result.parser,
        fetchVia: result.fetchVia,
        triedUrls: state.triedUrls,
        discoveredUrls: state.discoveredUrls,
        deliveryUrls: state.deliveryUrls,
      });
    }
  }

  return null;
}

export async function probeWebsiteForMenu(
  websiteUrl: string,
  options: ProbeWebsiteOptions = {},
): Promise<MenuProbeOutcome> {
  const maxUrls = options.maxUrls ?? 16;
  const log = options.onAttempt ?? (() => {});
  const batchSize =
    options.probeBatchSize ??
    (options.headless ? HEADLESS_PROBE_BATCH_SIZE : STATIC_PROBE_BATCH_SIZE);

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

  // Persistent dead-site short-circuit: if this host's homepage was
  // judged dead/placeholder within the last SITE_HEALTH_CACHE_TTL_DAYS
  // days we skip every fetch. The cache is fail-open (errors return
  // null) so a dropped read can never block a real probe.
  if (!options.bypassSiteHealthCache) {
    const cached = await isSiteCachedDead(normalized);
    if (cached) {
      if (options.verbose || options.onAttempt) {
        const ageDays = (cached.ageMs / (24 * 3600 * 1000)).toFixed(1);
        log(
          `  … site_health cache HIT for ${cached.host} (dead ${ageDays}d ago, TTL ${SITE_HEALTH_CACHE_TTL_DAYS}d) — skipping probe`,
        );
      }
      return finalizeProbe({
        parsed: null,
        matchedUrl: null,
        parser: null,
        fetchVia: null,
        triedUrls: [normalized],
        discoveredUrls: [],
        deliveryUrls: [],
      });
    }
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
    const state = { triedUrls, discoveredUrls, deliveryUrls };

    const staticHtml = await fetchWebsiteHtmlStaticOptional(seedUrl);
    if (staticHtml) {
      collectDeliveryFromHtml(deliveryUrls, staticHtml, seedUrl);
      discoveredUrls.push(
        ...discoverPlatformUrlsFromHtml(staticHtml, seedUrl),
        ...discoverMenuUrlsFromHtml(staticHtml, seedUrl, {
          preserveQuery: options.preserveQueryOnDiscover,
        }),
      );

      const platformFirst = priorityPlatformProbeUrls(normalized, staticHtml);
      if (platformFirst.length > 0) {
        if (options.verbose || options.onAttempt) {
          log(`  … platform-first (${platformFirst.length} URL(s)) before generic /menu paths`);
        }
        const platformHit = await tryPlatformUrlsFirst(platformFirst, options, state);
        if (platformHit) return platformHit;
      }

      const staticAttempt = parseMenuForUrl(staticHtml, seedUrl);
      if (staticAttempt.result && staticAttempt.parser) {
        if (!triedUrls.includes(seedUrl)) triedUrls.push(seedUrl);
        return finalizeProbe({
          parsed: staticAttempt.result,
          matchedUrl: seedUrl,
          parser: staticAttempt.parser,
          fetchVia: "static",
          triedUrls,
          discoveredUrls,
          deliveryUrls,
        });
      }

      const homepageText = staticHtml.replace(/<[^>]+>/g, " ").slice(0, 800);
      if (isDeadOrPlaceholderSite(staticHtml, homepageText)) {
        if (!triedUrls.includes(seedUrl)) triedUrls.push(seedUrl);
        if (options.verbose) log(`  … homepage looks dead/placeholder — skipping deep probe`);
        // Persist verdict for SITE_HEALTH_CACHE_TTL_DAYS so the next
        // ingest run can short-circuit before any fetch happens.
        void cacheDeadSite(normalized);
        return finalizeProbe({
          parsed: null,
          matchedUrl: null,
          parser: null,
          fetchVia: "static",
          triedUrls,
          discoveredUrls,
          deliveryUrls,
        });
      }
    }

    if (!triedUrls.includes(seedUrl)) triedUrls.push(seedUrl);
    const seed =
      staticHtml && !options.headless
        ? {
            html: staticHtml,
            visibleText: null,
            parsed: null,
            parser: null,
            fetchVia: "static" as const,
          }
        : await fetchAndParseUrl(seedUrl, {
            ...options,
            skipStaticFetch: Boolean(staticHtml),
          });

    if (seed.html && !staticHtml) {
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

    if (
      !seed.parsed &&
      seed.html &&
      !staticHtml &&
      !jsHeavyHomepage &&
      isDeadOrPlaceholderSite(seed.html, homepageText)
    ) {
      if (options.verbose) log(`  … homepage looks dead/placeholder — skipping deep probe`);
      void cacheDeadSite(normalized);
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

  // Probe the candidate queue in priority-ordered parallel batches.
  //
  // The legacy implementation was strictly sequential: for each URL it
  // awaited fetchAndParseUrl, accumulated discovered links, and only
  // moved on when the URL returned no parse. That meant a single slow
  // headless probe (~30-60s) blocked the rest of the queue.
  //
  // This loop now drains up to `batchSize` URLs at a time and probes
  // them with Promise.allSettled, then walks the results in original
  // priority order so the first parsed match still wins. Discovered
  // links from misses are appended to the queue exactly as before.
  while (queue.length > 0 && triedUrls.length < maxUrls) {
    const batch: string[] = [];
    while (
      batch.length < batchSize &&
      queue.length > 0 &&
      triedUrls.length < maxUrls
    ) {
      const url = queue.shift();
      if (!url || triedUrls.includes(url) || queued.has(url) || isBlockedMenuUrl(url)) continue;
      queued.add(url);
      triedUrls.push(url);
      batch.push(url);
    }
    if (batch.length === 0) continue;

    const settled = await Promise.allSettled(
      batch.map((url) => fetchAndParseUrl(url, options)),
    );

    // Pass 1: accumulate delivery/discovered/queue state for every URL,
    // in priority order, before deciding on a winner. This preserves
    // the behaviour of the legacy sequential loop where later misses
    // contributed their discovered links to the next iteration.
    for (let i = 0; i < settled.length; i++) {
      const url = batch[i];
      const settledResult = settled[i];
      if (settledResult.status !== "fulfilled") {
        if (options.verbose) log(`  … fetch failed ${url}`);
        continue;
      }
      const result = settledResult.value;
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
    }

    // Pass 2: return the highest-priority parsed result from this batch.
    // This is the "bail" path — subsequent batches are not run.
    for (let i = 0; i < settled.length; i++) {
      const settledResult = settled[i];
      if (settledResult.status !== "fulfilled") continue;
      const result = settledResult.value;
      if (result.parsed && result.parser) {
        return finalizeProbe({
          parsed: result.parsed,
          matchedUrl: batch[i],
          parser: result.parser,
          fetchVia: result.fetchVia,
          triedUrls,
          discoveredUrls,
          deliveryUrls,
        });
      }
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
