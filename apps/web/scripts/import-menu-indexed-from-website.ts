#!/usr/bin/env npx tsx
/**
 * Promote discovered restaurants to menu_indexed by parsing public website menus.
 *
 * Parsers: JSON-LD, Squarespace HTML, BentoBox JSON-LD, Sauce Next.js, SpotApps HTML,
 * Toast/Square/ChowNow/Popmenu/Olo (best-effort), plus homepage menu-link discovery.
 *
 * Usage:
 *   npm run db:import:menu-indexed:website:dry-run -- --limit=20
 *   npm run db:import:menu-indexed:website -- --region=williamsburg --limit=10
 *   npm run db:import:menu-indexed:website -- --list-regions
 *   npm run db:import:menu-indexed:website -- --include-chains --limit=5
 *   npm run db:import:menu-indexed:website:dry-run -- --headless --limit=10
 *   npm run db:import:menu-indexed:website:headless -- --limit=25 --concurrency=4
 *   npm run db:import:menu-indexed:website:headless -- --platform=toast --limit=20
 *
 * Headless (Playwright): run once after install —
 *   npx playwright install chromium
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "node:path";
import { insertPublishedIndexedMenu } from "../lib/menu-ingest/insert-indexed-menu";
import {
  loadProbeFailureCache,
  recordProbeFailure,
  recordProbeSuccess,
  saveProbeFailureCache,
  shouldSkipProbeHost,
} from "../lib/menu-ingest/probe-failure-cache";
import { mapWithConcurrency, probeWebsiteForMenuWithTimeout } from "../lib/menu-ingest/probe-pool";
import {
  classifyCandidatePlatform,
  type PlatformKind,
} from "../lib/menu-ingest/platform-route";
import {
  formatProbeAttempts,
} from "../lib/menu-ingest/probe-website-menu";
import { closePlaywrightBrowser } from "../lib/menu-ingest/fetch-website-playwright";
import {
  gridCellRadiusMeters,
  gridSamplePoints,
  rankWebsiteCandidates,
  websiteHostKey,
} from "../lib/menu-ingest/website-candidates";
import {
  printRegionList,
  resolveRegion,
} from "./lib/load-import-regions";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type ScriptOptions = {
  dryRun: boolean;
  limit: number;
  regionKey: string;
  includeChains: boolean;
  gridDivisions: number;
  listRegions: boolean;
  verbose: boolean;
  headless: boolean;
  concurrency: number;
  useFailureCache: boolean;
  platform: PlatformKind | "any";
  probeTimeoutMs: number;
};

function parsePlatformArg(raw: string): PlatformKind | "any" | null {
  const value = raw.toLowerCase();
  const allowed: PlatformKind[] = [
    "toast",
    "order_online",
    "square",
    "chownow",
    "bentobox",
    "spotapps",
    "sauce",
    "unknown",
  ];
  if (value === "any") return "any";
  return allowed.includes(value as PlatformKind) ? (value as PlatformKind) : null;
}

function parseArgs(argv: string[]): ScriptOptions {
  let dryRun = false;
  let limit = 20;
  let regionKey = "williamsburg";
  let includeChains = false;
  let gridDivisions = 3;
  let listRegions = false;
  let verbose = false;
  let headless = false;
  let concurrency = 0;
  let useFailureCache = true;
  let platform: PlatformKind | "any" = "any";
  let probeTimeoutMs = 90_000;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    if (arg === "--include-chains") includeChains = true;
    if (arg === "--list-regions") listRegions = true;
    if (arg === "--verbose") verbose = true;
    if (arg === "--headless") headless = true;
    if (arg === "--no-failure-cache") useFailureCache = false;
    if (arg.startsWith("--limit=")) limit = Number.parseInt(arg.slice(8), 10);
    if (arg.startsWith("--region=")) regionKey = arg.slice(9);
    if (arg.startsWith("--grid=")) gridDivisions = Number.parseInt(arg.slice(7), 10);
    if (arg.startsWith("--concurrency=")) concurrency = Number.parseInt(arg.slice(14), 10);
    if (arg.startsWith("--platform=")) {
      const parsed = parsePlatformArg(arg.slice(11));
      if (parsed) platform = parsed;
    }
    if (arg.startsWith("--probe-timeout-ms=")) {
      probeTimeoutMs = Number.parseInt(arg.slice(19), 10);
    }
  }

  const resolvedConcurrency =
    concurrency > 0 ? concurrency : headless ? 4 : 2;

  return {
    dryRun,
    limit: Number.isFinite(limit) ? limit : 20,
    regionKey,
    includeChains,
    gridDivisions: Number.isFinite(gridDivisions) ? Math.max(1, gridDivisions) : 3,
    listRegions,
    verbose,
    headless,
    concurrency: Number.isFinite(resolvedConcurrency) ? Math.max(1, resolvedConcurrency) : 2,
    useFailureCache,
    platform,
    probeTimeoutMs: Number.isFinite(probeTimeoutMs) ? Math.max(15_000, probeTimeoutMs) : 90_000,
  };
}

async function loadRegionalDiscoveredIds(
  regionKey: string,
  gridDivisions: number,
): Promise<string[]> {
  const region = resolveRegion(regionKey);
  const radiusMeters = gridCellRadiusMeters(region.bbox, gridDivisions);
  const points = gridSamplePoints(region.bbox, gridDivisions);
  const ids = new Set<string>();

  for (const point of points) {
    const { data, error } = await supabase.rpc("search_restaurants_for_agents", {
      search_query: "",
      lat: point.lat,
      lng: point.lng,
      radius_meters: radiusMeters,
      min_agent_score: 0,
      dietary_filters: [],
    });

    if (error) {
      throw new Error(`Region search failed: ${error.message}`);
    }

    for (const row of data ?? []) {
      if (row.verification_status === "discovered") {
        ids.add(row.id as string);
      }
    }
  }

  return [...ids];
}

async function loadIndexedWebsiteHosts(): Promise<Map<string, { id: string; name: string }>> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, website_url")
    .eq("verification_status", "menu_indexed")
    .not("website_url", "is", null);

  if (error) {
    throw new Error(`Failed to load indexed hosts: ${error.message}`);
  }

  const hosts = new Map<string, { id: string; name: string }>();
  for (const row of data ?? []) {
    const host = websiteHostKey(row.website_url!);
    if (host && !hosts.has(host)) {
      hosts.set(host, { id: row.id, name: row.name });
    }
  }
  return hosts;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.listRegions) {
    printRegionList();
    return;
  }

  const region = resolveRegion(options.regionKey);

  console.log(
    `JSON-LD website menu import — ${region.label} — limit ${options.limit}${options.dryRun ? " [DRY RUN]" : ""}`,
  );
  console.log(
    `Filters: ${options.includeChains ? "chains included" : "chains excluded"}, ${options.gridDivisions}×${options.gridDivisions} geo grid, concurrency ${options.concurrency}${options.platform !== "any" ? `, platform ${options.platform}` : ""}${options.headless ? ", headless (Playwright)" : ""}${options.useFailureCache ? ", failure cache" : ""}\n`,
  );

  try {
    const discoveredIds = await loadRegionalDiscoveredIds(
      options.regionKey,
      options.gridDivisions,
    );

    if (discoveredIds.length === 0) {
      console.log("No discovered restaurants in region.");
      return;
    }

    const { data: rows, error } = await supabase
      .from("restaurants")
      .select("id, name, website_url, verification_status")
      .in("id", discoveredIds)
      .eq("verification_status", "discovered")
      .not("website_url", "is", null);

    if (error) {
      throw new Error(`Failed to load candidates: ${error.message}`);
    }

    const candidates = rankWebsiteCandidates(rows ?? [], {
      includeChains: options.includeChains,
    });

    let filteredCandidates = candidates;
    if (options.platform !== "any") {
      console.log(`Classifying ${Math.min(candidates.length, options.limit * 4)} candidates by platform (static)…`);
      const scanPool = candidates.slice(0, Math.max(options.limit * 4, options.limit));
      const classified = await mapWithConcurrency(scanPool, 8, async (candidate) => ({
        candidate,
        platform: await classifyCandidatePlatform(candidate.website_url),
      }));
      filteredCandidates = classified
        .filter((row) => row.platform === options.platform)
        .map((row) => row.candidate);
      console.log(
        `Platform filter (${options.platform}): ${filteredCandidates.length} of ${scanPool.length} scanned candidates match\n`,
      );
      if (filteredCandidates.length === 0) {
        console.log("No candidates match --platform filter. Try another platform or drop the filter.");
        return;
      }
    }

    const chainFiltered = (rows?.length ?? 0) - candidates.length;
    console.log(
      `Pool: ${discoveredIds.length} discovered in region, ${rows?.length ?? 0} with website_url, ${chainFiltered} chains filtered, ${filteredCandidates.length} ranked candidates\n`,
    );

    if (filteredCandidates.length === 0) {
      console.log("No eligible candidates after filtering. Try --include-chains or another --region.");
      return;
    }

    const indexedHosts = await loadIndexedWebsiteHosts();
    if (indexedHosts.size > 0) {
      console.log(`${indexedHosts.size} website host(s) already menu_indexed — duplicates will be skipped\n`);
    }

    const failureCache = options.useFailureCache ? loadProbeFailureCache() : null;
    const workQueue: typeof filteredCandidates = [];
    let duplicateSkipped = 0;
    let cacheSkipped = 0;

    for (const candidate of filteredCandidates) {
      if (workQueue.length >= options.limit) break;

      const host = websiteHostKey(candidate.website_url);
      const existingIndexed = host ? indexedHosts.get(host) : undefined;
      if (existingIndexed && existingIndexed.id !== candidate.id) {
        console.log(`→ ${candidate.name} (${candidate.id})`);
        console.log(
          `  ⊘ duplicate website (${host}) — already menu_indexed as ${existingIndexed.name} (${existingIndexed.id})`,
        );
        duplicateSkipped++;
        continue;
      }

      if (failureCache) {
        const cached = shouldSkipProbeHost(candidate.website_url, failureCache);
        if (cached) {
          console.log(`→ ${candidate.name} (${candidate.id})`);
          console.log(
            `  ⊘ cached miss (${cached.failCount}×, last ${cached.lastFailedAt.slice(0, 10)}) — skipping probe`,
          );
          cacheSkipped++;
          continue;
        }
      }

      workQueue.push(candidate);
    }

    if (workQueue.length === 0) {
      console.log("No candidates left after duplicate/cache filtering.");
      return;
    }

    console.log(`Probing ${workQueue.length} candidate(s) with concurrency ${options.concurrency}…\n`);

    type ProbeOutcome =
      | { status: "promoted"; items: number }
      | { status: "skipped" };

    const outcomes = await mapWithConcurrency(workQueue, options.concurrency, async (candidate) => {
      console.log(`→ ${candidate.name} (${candidate.id})`);
      console.log(`  stored: ${candidate.website_url} (score ${candidate.score})`);
      if (candidate.skipReason) {
        console.log(`  note: ${candidate.skipReason}`);
      }

      try {
        const probe = await probeWebsiteForMenuWithTimeout(
          candidate.website_url,
          {
            verbose: options.verbose,
            headless: options.headless,
            maxUrls: 18,
            preserveQueryOnDiscover: true,
            onAttempt: options.verbose ? (msg) => console.log(msg) : undefined,
          },
          options.probeTimeoutMs,
        );

        if (!probe.parsed || !probe.matchedUrl) {
          console.log(
            `  ⊘ No menu items${probe.triedUrls.length === 0 ? " (probe timeout)" : ""} (tried: ${formatProbeAttempts(probe.triedUrls)})`,
          );
          if (failureCache) {
            recordProbeFailure(candidate.website_url, failureCache, "no_menu");
          }
          return { status: "skipped" } satisfies ProbeOutcome;
        }

        const itemCount = probe.parsed.categories.reduce((n, c) => n + c.items.length, 0);
        const via = probe.fetchVia ? ` via ${probe.fetchVia}` : "";
        console.log(
          `  ✓ ${probe.parser}${via} on ${probe.matchedUrl} (${itemCount} items, source ${probe.parsed.source})`,
        );

        if (failureCache) {
          recordProbeSuccess(candidate.website_url, failureCache);
        }

        if (options.dryRun) {
          console.log(`  [dry-run] would promote to menu_indexed`);
          return { status: "promoted", items: itemCount } satisfies ProbeOutcome;
        }

        const result = await insertPublishedIndexedMenu(
          supabase,
          candidate.id,
          probe.parsed.categories,
          `menu_indexed_${probe.parsed.source}`,
        );
        console.log(`  ✓ promoted to menu_indexed (${result.itemCount} items)`);
        return { status: "promoted", items: result.itemCount } satisfies ProbeOutcome;
      } catch (err) {
        console.log(`  ✗ ${err instanceof Error ? err.message : err}`);
        if (failureCache) {
          recordProbeFailure(
            candidate.website_url,
            failureCache,
            err instanceof Error ? err.message : "error",
          );
        }
        return { status: "skipped" } satisfies ProbeOutcome;
      }
    });

    const promoted = outcomes.filter((o) => o.status === "promoted").length;
    const items = outcomes.reduce((n, o) => n + (o.status === "promoted" ? o.items : 0), 0);
    const skipped = outcomes.filter((o) => o.status === "skipped").length;

    if (failureCache && options.useFailureCache) {
      saveProbeFailureCache(failureCache);
    }

    console.log(
      `\nDone: ${promoted} promoted, ${items} items, ${skipped} skipped, ${workQueue.length} probed, ${duplicateSkipped} duplicate-host skipped, ${cacheSkipped} cache-skipped (${filteredCandidates.length} in pool)`,
    );
  } finally {
    if (options.headless) {
      await closePlaywrightBrowser();
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
