import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type Bbox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type DataSource = "osm" | "nyc_open_data";

export type RegionConfig = {
  label: string;
  tier: number;
  status?: string;
  bbox: Bbox;
  dataSources: DataSource[];
  notes?: string;
};

type RegionsFile = {
  version: number;
  defaultRegion: string;
  regions: Record<string, RegionConfig>;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGIONS_PATH = resolve(__dirname, "../data/import-regions.json");

let cached: RegionsFile | null = null;

export function loadRegionsFile(): RegionsFile {
  if (!cached) {
    cached = JSON.parse(readFileSync(REGIONS_PATH, "utf8")) as RegionsFile;
  }
  return cached;
}

export function getRegionKeys(): string[] {
  return Object.keys(loadRegionsFile().regions).sort();
}

export function resolveRegion(regionKey: string | undefined): RegionConfig & { key: string } {
  const file = loadRegionsFile();
  const key = regionKey?.trim() || file.defaultRegion;
  const region = file.regions[key];
  if (!region) {
    const available = getRegionKeys().join(", ");
    throw new Error(`Unknown region "${key}". Available: ${available}`);
  }
  return { ...region, key };
}

export function regionHasSource(region: RegionConfig, source: DataSource): boolean {
  return region.dataSources.includes(source);
}

export function printRegionList(): void {
  const file = loadRegionsFile();
  console.log("\nImport regions (apps/web/scripts/data/import-regions.json)\n");
  console.log(
    `${"key".padEnd(16)} ${"tier".padEnd(5)} ${"status".padEnd(10)} ${"sources".padEnd(32)} label`,
  );
  console.log("-".repeat(72));

  for (const key of getRegionKeys()) {
    const r = file.regions[key];
    const sources = r.dataSources.join("+");
    const status = r.status ?? "—";
    console.log(
      `${key.padEnd(16)} ${String(r.tier).padEnd(5)} ${status.padEnd(10)} ${sources.padEnd(32)} ${r.label}`,
    );
  }

  console.log(`\nDefault region: ${file.defaultRegion}`);
  console.log("\nExample:");
  console.log("  npm run db:import:discovered -- --region=manhattan --dry-run\n");
}

export function printHelp(): void {
  console.log(`
Discovered-layer import — OpenStreetMap + optional NYC Open Data

Usage:
  npx tsx scripts/import-discovered.ts --region=<key> [options]

Options:
  --region=<key>    Bbox region (see --list-regions)
  --list-regions    Show all configured regions
  --dry-run         Fetch and dedupe only; no database writes
  --batch-size=N    Insert batch size (default 200, max 500)
  --osm-only        Skip municipal open-data feeds
  --nyc-only        NYC inspections only (NYC regions only)
  --no-osm-extended Skip M5 second OSM pass (restaurant=yes, hotel restaurants)
  --help            Show this message

Examples:
  npm run db:import:discovered -- --region=manhattan --dry-run
  npm run db:import:discovered -- --region=brooklyn
  npm run db:import:discovered:list
`);
}
