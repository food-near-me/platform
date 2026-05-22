#!/usr/bin/env npx tsx
/**
 * Re-probe and replace published menus for thin menu_indexed rows (e.g. pre-Toast Apollo).
 *
 * Usage:
 *   npm run db:refresh:menu-indexed:website:headless:dry-run -- --max-items=20
 *   npm run db:refresh:menu-indexed:website:headless -- --ids=0767b161-2b18-4f92-9f90-11d4ff30d5e1
 *   npm run db:refresh:menu-indexed:website:headless -- --region=williamsburg --max-items=20 --limit=5
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "node:path";
import { refreshPublishedIndexedMenu } from "../lib/menu-ingest/insert-indexed-menu";
import {
  formatProbeAttempts,
  probeWebsiteForMenu,
} from "../lib/menu-ingest/probe-website-menu";
import { closePlaywrightBrowser } from "../lib/menu-ingest/fetch-website-playwright";
import {
  gridCellRadiusMeters,
  gridSamplePoints,
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
  gridDivisions: number;
  listRegions: boolean;
  verbose: boolean;
  headless: boolean;
  maxItems: number;
  ids: string[];
  sourcePattern: RegExp | null;
};

function parseArgs(argv: string[]): ScriptOptions {
  let dryRun = false;
  let limit = 20;
  let regionKey = "williamsburg";
  let gridDivisions = 3;
  let listRegions = false;
  let verbose = false;
  let headless = false;
  let maxItems = 20;
  let ids: string[] = [];
  let sourcePattern: RegExp | null = /visible_text|toast/i;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    if (arg === "--list-regions") listRegions = true;
    if (arg === "--verbose") verbose = true;
    if (arg === "--headless") headless = true;
    if (arg === "--any-source") sourcePattern = null;
    if (arg.startsWith("--limit=")) limit = Number.parseInt(arg.slice(8), 10);
    if (arg.startsWith("--region=")) regionKey = arg.slice(9);
    if (arg.startsWith("--grid=")) gridDivisions = Number.parseInt(arg.slice(7), 10);
    if (arg.startsWith("--max-items=")) maxItems = Number.parseInt(arg.slice(12), 10);
    if (arg.startsWith("--ids=")) {
      ids = arg
        .slice(6)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    }
  }

  return {
    dryRun,
    limit: Number.isFinite(limit) ? limit : 20,
    regionKey,
    gridDivisions: Number.isFinite(gridDivisions) ? Math.max(1, gridDivisions) : 3,
    listRegions,
    verbose,
    headless,
    maxItems: Number.isFinite(maxItems) ? maxItems : 20,
    ids,
    sourcePattern,
  };
}

async function loadRegionalIndexedIds(
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
      if (row.verification_status === "menu_indexed") {
        ids.add(row.id as string);
      }
    }
  }

  return [...ids];
}

async function countPublishedItems(restaurantId: string): Promise<number> {
  const { data: menus } = await supabase
    .from("menus")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "published");

  if (!menus?.length) return 0;

  let total = 0;
  for (const menu of menus) {
    const { data: cats } = await supabase
      .from("menu_categories")
      .select("id")
      .eq("menu_id", menu.id);
    for (const cat of cats ?? []) {
      const { count } = await supabase
        .from("menu_items")
        .select("*", { count: "exact", head: true })
        .eq("category_id", cat.id);
      total += count ?? 0;
    }
  }
  return total;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.listRegions) {
    printRegionList();
    return;
  }

  const region = resolveRegion(options.regionKey);

  console.log(
    `Refresh menu_indexed website menus — ${region.label} — limit ${options.limit}, max-items ${options.maxItems}${options.dryRun ? " [DRY RUN]" : ""}`,
  );
  console.log(
    `Filters: ${options.sourcePattern ? `source ~ ${options.sourcePattern}` : "any source"}, ${options.gridDivisions}×${options.gridDivisions} geo grid${options.headless ? ", headless (Playwright)" : ""}\n`,
  );

  if (options.ids.length === 0) {
    console.log("Scanning region for menu_indexed restaurants…");
  }

  try {
    const candidateRows: Array<{
      id: string;
      name: string;
      website_url: string;
      source: string | null;
      itemCount: number;
    }> = [];

    if (options.ids.length > 0) {
      const { data: rows, error } = await supabase
        .from("restaurants")
        .select("id, name, website_url, source, verification_status")
        .in("id", options.ids)
        .eq("verification_status", "menu_indexed")
        .not("website_url", "is", null);

      if (error) throw new Error(`Failed to load ids: ${error.message}`);

      for (const row of rows ?? []) {
        candidateRows.push({
          ...row,
          website_url: row.website_url!,
          itemCount: await countPublishedItems(row.id),
        });
      }
    } else {
      const indexedIds = await loadRegionalIndexedIds(options.regionKey, options.gridDivisions);
      if (indexedIds.length === 0) {
        console.log("No menu_indexed restaurants in region.");
        return;
      }

      console.log(`Found ${indexedIds.length} menu_indexed in region — counting published items…`);

      const { data: rows, error } = await supabase
        .from("restaurants")
        .select("id, name, website_url, source, verification_status")
        .in("id", indexedIds)
        .eq("verification_status", "menu_indexed")
        .not("website_url", "is", null);

      if (error) throw new Error(`Failed to load candidates: ${error.message}`);

      let scanned = 0;
      for (const row of rows ?? []) {
        scanned++;
        process.stdout.write(`  [${scanned}/${rows?.length ?? 0}] ${row.name}…\r`);
        const itemCount = await countPublishedItems(row.id);
        if (itemCount >= options.maxItems) continue;
        if (options.sourcePattern && !options.sourcePattern.test(row.source ?? "")) continue;
        candidateRows.push({
          id: row.id,
          name: row.name,
          website_url: row.website_url!,
          source: row.source,
          itemCount,
        });
      }
      process.stdout.write("\n");

      candidateRows.sort((a, b) => a.itemCount - b.itemCount);
    }

    console.log(`Pool: ${candidateRows.length} refresh candidates\n`);

    if (candidateRows.length === 0) {
      console.log("No eligible candidates. Try --any-source, --max-items, or --ids.");
      return;
    }

    let attempted = 0;
    let refreshed = 0;
    let items = 0;
    let skipped = 0;
    const probeTotal = Math.min(options.limit, candidateRows.length);

    for (const candidate of candidateRows) {
      if (attempted >= options.limit) break;

      attempted++;
      console.log(`→ [${attempted}/${probeTotal}] ${candidate.name} (${candidate.id})`);
      console.log(`  stored: ${candidate.website_url} (${candidate.itemCount} items, ${candidate.source})`);

      try {
        const probe = await probeWebsiteForMenu(candidate.website_url, {
          verbose: options.verbose,
          headless: options.headless,
          maxUrls: 18,
          preserveQueryOnDiscover: true,
          onAttempt: (msg) => console.log(msg),
        });

        if (!probe.parsed || !probe.matchedUrl) {
          console.log(
            `  ⊘ No menu items (tried: ${formatProbeAttempts(probe.triedUrls)})`,
          );
          skipped++;
          continue;
        }

        const itemCount = probe.parsed.categories.reduce((n, c) => n + c.items.length, 0);
        if (itemCount <= candidate.itemCount) {
          console.log(
            `  ⊘ Probe found ${itemCount} items (not better than ${candidate.itemCount}); skip`,
          );
          skipped++;
          continue;
        }

        const via = probe.fetchVia ? ` via ${probe.fetchVia}` : "";
        console.log(
          `  ✓ ${probe.parser}${via} on ${probe.matchedUrl} (${itemCount} items, source ${probe.parsed.source})`,
        );

        if (options.dryRun) {
          console.log(`  [dry-run] would replace published menu`);
          refreshed++;
          items += itemCount;
          continue;
        }

        const result = await refreshPublishedIndexedMenu(
          supabase,
          candidate.id,
          probe.parsed.categories,
          `menu_indexed_${probe.parsed.source}`,
        );
        refreshed++;
        items += result.itemCount;
        console.log(`  ✓ refreshed (${candidate.itemCount} → ${result.itemCount} items)`);
      } catch (err) {
        console.log(`  ✗ ${err instanceof Error ? err.message : err}`);
        skipped++;
      }
    }

    console.log(
      `\nDone: ${refreshed} refreshed, ${items} items, ${skipped} skipped, ${attempted} attempted (${candidateRows.length} in pool)`,
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
