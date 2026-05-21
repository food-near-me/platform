#!/usr/bin/env npx tsx
/**
 * Run discovered imports for multiple regions (NYC boroughs, presets, or explicit list).
 *
 * Usage:
 *   npx tsx scripts/import-discovered-batch.ts --preset=nyc-boroughs
 *   npx tsx scripts/import-discovered-batch.ts --regions=bronx,staten_island
 *   npx tsx scripts/import-discovered-batch.ts --preset=nyc-boroughs --dry-run
 *   npx tsx scripts/import-discovered-batch.ts --preset=nyc-boroughs --update-status
 *   npx tsx scripts/import-discovered-batch.ts --pending-only --preset=nyc-boroughs
 *
 * Each region runs NYC Open Data first (if configured), then OSM — same order as manual runs.
 */

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import {
  getRegionKeys,
  loadRegionsFile,
  regionHasSource,
  type RegionConfig,
} from "./lib/load-import-regions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMPORT_SCRIPT = resolve(__dirname, "import-discovered.ts");
const REGIONS_PATH = resolve(__dirname, "data/import-regions.json");

const PRESETS: Record<string, string[]> = {
  "nyc-boroughs": ["queens", "bronx", "staten_island"],
  "nyc-boroughs-all": [
    "williamsburg",
    "brooklyn",
    "manhattan",
    "queens",
    "bronx",
    "staten_island",
  ],
};

function getTierOsmRegionKeys(tier: number): string[] {
  const file = loadRegionsFile();
  return getRegionKeys().filter((key) => {
    const r = file.regions[key];
    return (
      r.tier === tier &&
      regionHasSource(r, "osm") &&
      !regionHasSource(r, "nyc_open_data")
    );
  });
}

/** Tier-1 metros with OSM only (excludes NYC boroughs / nyc_open_data regions). */
function getTier1OsmRegionKeys(): string[] {
  return getTierOsmRegionKeys(1);
}

/** Tier-2 metros (OSM only). */
function getTier2OsmRegionKeys(): string[] {
  return getTierOsmRegionKeys(2);
}

const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`
Batch discovered import

Options:
  --preset=<name>       ${Object.keys(PRESETS).join(" | ")} | tier1-osm | tier2-osm (from import-regions.json)
  --regions=a,b,c       Comma-separated region keys
  --pending-only        Skip regions with status "imported"
  --dry-run             Pass --dry-run to each import
  --update-status       Set status "imported" in import-regions.json after success
  --continue-on-error   Keep going if one region/phase fails
  --help                Show this message

Examples:
  npm run db:import:discovered:batch -- --preset=nyc-boroughs
  npm run db:import:discovered:batch -- --preset=tier2-osm --pending-only --dry-run
  npm run db:import:discovered:batch -- --regions=detroit,cleveland --update-status
`);
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const pendingOnly = args.includes("--pending-only");
const updateStatus = args.includes("--update-status");
const continueOnError = args.includes("--continue-on-error");

const presetArg = args.find((a) => a.startsWith("--preset="));
const regionsArg = args.find((a) => a.startsWith("--regions="));

function resolveRegionList(): string[] {
  if (presetArg) {
    const name = presetArg.split("=")[1];
    if (name === "tier1-osm") {
      return getTier1OsmRegionKeys();
    }
    if (name === "tier2-osm") {
      return getTier2OsmRegionKeys();
    }
    const preset = PRESETS[name];
    if (!preset) {
      throw new Error(
        `Unknown preset "${name}". Available: ${Object.keys(PRESETS).join(", ")}, tier1-osm, tier2-osm`,
      );
    }
    return preset;
  }
  if (regionsArg) {
    return regionsArg
      .split("=")[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  throw new Error("Specify --preset=<name> or --regions=a,b,c (see --help)");
}

function runImport(region: string, phase: "nyc" | "osm"): number {
  const phaseArgs = phase === "nyc" ? ["--nyc-only"] : ["--osm-only"];
  const extra = dryRun ? ["--dry-run"] : [];
  console.log(`\n── ${region} (${phase}) ──\n`);

  const result = spawnSync("npx", ["tsx", IMPORT_SCRIPT, `--region=${region}`, ...phaseArgs, ...extra], {
    stdio: "inherit",
    cwd: resolve(__dirname, ".."),
    env: process.env,
  });

  return result.status ?? 1;
}

function markRegionImported(regionKey: string): void {
  const file = JSON.parse(readFileSync(REGIONS_PATH, "utf8")) as ReturnType<typeof loadRegionsFile>;
  const region = file.regions[regionKey];
  if (!region) return;
  region.status = "imported";
  writeFileSync(REGIONS_PATH, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`   ✓ Marked ${regionKey} as imported in import-regions.json`);
}

const file = loadRegionsFile();
const requested = resolveRegionList();
const unknown = requested.filter((k) => !file.regions[k]);
if (unknown.length) {
  throw new Error(`Unknown regions: ${unknown.join(", ")}. See: npm run db:import:discovered:list`);
}

const regions = requested.filter((key) => {
  const r = file.regions[key];
  if (pendingOnly && r.status === "imported") {
    console.log(`Skipping ${key} (already imported)`);
    return false;
  }
  return true;
});

if (!regions.length) {
  console.log("No regions to import.");
  process.exit(0);
}

console.log(`\nBatch import: ${regions.join(", ")}`);
if (dryRun) console.log("Mode: DRY RUN");
if (pendingOnly) console.log("Filter: pending only");

type PhaseResult = { region: string; phase: string; ok: boolean };
const results: PhaseResult[] = [];

for (const regionKey of regions) {
  const region: RegionConfig = file.regions[regionKey];
  const phases: Array<"nyc" | "osm"> = [];
  if (regionHasSource(region, "nyc_open_data")) phases.push("nyc");
  if (regionHasSource(region, "osm")) phases.push("osm");

  if (!phases.length) {
    console.warn(`Skipping ${regionKey}: no data sources`);
    continue;
  }

  console.log(`\n══════════════════════════════════════`);
  console.log(`  ${region.label} (${regionKey})`);
  console.log(`══════════════════════════════════════`);

  let regionOk = true;
  for (const phase of phases) {
    const code = runImport(regionKey, phase);
    const ok = code === 0;
    results.push({ region: regionKey, phase, ok });
    if (!ok) {
      regionOk = false;
      if (!continueOnError) {
        console.error(`\nStopped: ${regionKey} ${phase} failed (exit ${code})`);
        process.exit(code);
      }
    }
  }

  if (regionOk && updateStatus && !dryRun) {
    markRegionImported(regionKey);
  }
}

console.log("\n══════════════════════════════════════");
console.log("  Batch summary");
console.log("══════════════════════════════════════\n");

for (const r of results) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.region} (${r.phase})`);
}

const failed = results.filter((r) => !r.ok).length;
if (failed) {
  console.log(`\n${failed} phase(s) failed.`);
  process.exit(1);
}

console.log("\n✅ Batch complete.\n");
