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
  formatProbeAttempts,
  probeWebsiteForMenu,
} from "../lib/menu-ingest/probe-website-menu";
import { closePlaywrightBrowser } from "../lib/menu-ingest/fetch-website-playwright";
import {
  gridCellRadiusMeters,
  gridSamplePoints,
  rankWebsiteCandidates,
} from "../lib/menu-ingest/website-candidates";
import {
  getRegionKeys,
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
};

function parseArgs(argv: string[]): ScriptOptions {
  let dryRun = false;
  let limit = 20;
  let regionKey = "williamsburg";
  let includeChains = false;
  let gridDivisions = 3;
  let listRegions = false;
  let verbose = false;
  let headless = false;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    if (arg === "--include-chains") includeChains = true;
    if (arg === "--list-regions") listRegions = true;
    if (arg === "--verbose") verbose = true;
    if (arg === "--headless") headless = true;
    if (arg.startsWith("--limit=")) limit = Number.parseInt(arg.slice(8), 10);
    if (arg.startsWith("--region=")) regionKey = arg.slice(9);
    if (arg.startsWith("--grid=")) gridDivisions = Number.parseInt(arg.slice(7), 10);
  }

  return {
    dryRun,
    limit: Number.isFinite(limit) ? limit : 20,
    regionKey,
    includeChains,
    gridDivisions: Number.isFinite(gridDivisions) ? Math.max(1, gridDivisions) : 3,
    listRegions,
    verbose,
    headless,
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
    `Filters: ${options.includeChains ? "chains included" : "chains excluded"}, ${options.gridDivisions}×${options.gridDivisions} geo grid${options.headless ? ", headless (Playwright)" : ""}\n`,
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

    const chainFiltered = (rows?.length ?? 0) - candidates.length;
    console.log(
      `Pool: ${discoveredIds.length} discovered in region, ${rows?.length ?? 0} with website_url, ${chainFiltered} chains filtered, ${candidates.length} ranked candidates\n`,
    );

    if (candidates.length === 0) {
      console.log("No eligible candidates after filtering. Try --include-chains or another --region.");
      return;
    }

    let attempted = 0;
    let promoted = 0;
    let items = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      if (attempted >= options.limit) break;

      attempted++;
      console.log(`→ ${candidate.name} (${candidate.id})`);
      console.log(`  stored: ${candidate.website_url} (score ${candidate.score})`);
      if (candidate.skipReason) {
        console.log(`  note: ${candidate.skipReason}`);
      }

      try {
        const probe = await probeWebsiteForMenu(candidate.website_url, {
          verbose: options.verbose,
          headless: options.headless,
          onAttempt: options.verbose ? (msg) => console.log(msg) : undefined,
        });

        if (!probe.parsed || !probe.matchedUrl) {
          console.log(
            `  ⊘ No menu items (tried: ${formatProbeAttempts(probe.triedUrls)})`,
          );
          skipped++;
          continue;
        }

        const itemCount = probe.parsed.categories.reduce((n, c) => n + c.items.length, 0);
        const via = probe.fetchVia ? ` via ${probe.fetchVia}` : "";
        console.log(
          `  ✓ ${probe.parser}${via} on ${probe.matchedUrl} (${itemCount} items, source ${probe.parsed.source})`,
        );

        if (options.dryRun) {
          console.log(`  [dry-run] would promote to menu_indexed`);
          promoted++;
          items += itemCount;
          continue;
        }

        const result = await insertPublishedIndexedMenu(
          supabase,
          candidate.id,
          probe.parsed.categories,
          `menu_indexed_${probe.parsed.source}`,
        );
        promoted++;
        items += result.itemCount;
        console.log(`  ✓ promoted to menu_indexed (${result.itemCount} items)`);
      } catch (err) {
        console.log(`  ✗ ${err instanceof Error ? err.message : err}`);
        skipped++;
      }
    }

    console.log(
      `\nDone: ${promoted} promoted, ${items} items, ${skipped} skipped, ${attempted} attempted (${candidates.length} in pool)`,
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
