#!/usr/bin/env npx tsx
/**
 * Import discovered-layer restaurants from OpenStreetMap + optional NYC Open Data.
 *
 * Usage:
 *   npx tsx scripts/import-discovered.ts --region=manhattan
 *   npx tsx scripts/import-discovered.ts --list-regions
 *   npx tsx scripts/import-discovered.ts --dry-run
 *
 * Requires migrations:
 *   npm run db:migrate:discovered-layer
 *   npm run db:migrate:import-dedup
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or anon for dev)
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import {
  printHelp,
  printRegionList,
  regionHasSource,
  resolveRegion,
  type Bbox,
} from "./lib/load-import-regions.js";

const args = process.argv.slice(2);

if (args.includes("--list-regions")) {
  printRegionList();
  process.exit(0);
}

if (args.includes("--help")) {
  printHelp();
  process.exit(0);
}

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const NYC_INSPECTIONS_URL =
  "https://data.cityofnewyork.us/resource/43nn-pn8j.json";

const dryRun = args.includes("--dry-run");
const osmOnly = args.includes("--osm-only");
const nycOnly = args.includes("--nyc-only");
const regionArg = args.find((a) => a.startsWith("--region="));
const regionKey = regionArg?.split("=")[1];
const region = resolveRegion(regionKey);
const bbox: Bbox = region.bbox;
const hasNycOpenData = regionHasSource(region, "nyc_open_data");
const hasOsm = regionHasSource(region, "osm");

const batchSizeArg = args.find((a) => a.startsWith("--batch-size="));
const BATCH_SIZE = Math.min(
  500,
  Math.max(50, parseInt(batchSizeArg?.split("=")[1] ?? "200", 10) || 200),
);

type ImportStats = {
  inserted: number;
  skipped: number;
  enriched: number;
  protected: number;
};

type RowAction =
  | { type: "skip" }
  | { type: "protected" }
  | { type: "enrich"; dup: ExistingRecord }
  | { type: "insert" };

const SPATIAL_RADIUS_M = 80;
const SPATIAL_CACHE_RADIUS_M = 120;

type DiscoveredRow = {
  name: string;
  slug: string;
  lat: number;
  lng: number;
  address: string | null;
  cuisine_type: string[];
  source: string;
  source_record_id: string;
  import_confidence: number;
  website_url: string | null;
  phone: string | null;
  health_inspection_grade: string | null;
};

function createPoint(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

function slugify(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base}-${suffix}`.slice(0, 80);
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/\b(the|inc|llc|co)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length >= nb.length ? na : nb;
  let matches = 0;
  for (const ch of shorter) {
    if (longer.includes(ch)) matches++;
  }
  return matches / longer.length;
}

function parseOsmCuisine(tags: Record<string, string>): string[] {
  const raw = tags.cuisine || tags["cuisine:en"] || "";
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((c) => c.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean)
    .slice(0, 8);
}

function buildAddressFromNyc(row: Record<string, string>): string | null {
  const parts = [
    row.building,
    row.street,
    row.boro === "Brooklyn" ? "Brooklyn" : row.boro,
    row.zipcode ? `NY ${row.zipcode}` : "NY",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function inBbox(lat: number, lng: number): boolean {
  return lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east;
}

async function fetchOverpass(): Promise<DiscoveredRow[]> {
  const query = `
[out:json][timeout:120];
(
  node["amenity"~"restaurant|cafe|fast_food|bar|pub|biergarten|food_court|ice_cream"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["amenity"~"restaurant|cafe|fast_food|bar|pub|biergarten|food_court|ice_cream"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out center tags;
`;

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  let res: Response | null = null;
  for (const endpoint of endpoints) {
    const attempt = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "FoodNearMe/1.0 (discovered-layer import)",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (attempt.ok) {
      res = attempt;
      break;
    }
    if (attempt.status !== 406 && attempt.status !== 429) {
      res = attempt;
      break;
    }
  }

  if (!res?.ok) {
    const fallback = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "FoodNearMe/1.0 (discovered-layer import)",
        },
      },
    );
    res = fallback;
  }

  if (!res.ok) {
    throw new Error(`Overpass API failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as {
    elements: Array<{
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };

  const rows: DiscoveredRow[] = [];

  for (const el of json.elements) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (!name) continue;

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null || !inBbox(lat, lng)) continue;

    const housenumber = tags["addr:housenumber"];
    const street = tags["addr:street"];
    const city = tags["addr:city"];
    const postcode = tags["addr:postcode"];
    const addressParts = [housenumber, street, city, postcode ? `NY ${postcode}` : "NY"].filter(
      Boolean,
    );

    const sourceRecordId = `${el.type}/${el.id}`;
    rows.push({
      name,
      slug: slugify(name, `osm-${el.id}`),
      lat,
      lng,
      address: addressParts.length ? addressParts.join(", ") : null,
      cuisine_type: parseOsmCuisine(tags),
      source: "osm",
      source_record_id: sourceRecordId,
      import_confidence: tags["addr:street"] ? 0.75 : 0.6,
      website_url: tags.website || tags["contact:website"] || null,
      phone: tags.phone || tags["contact:phone"] || null,
      health_inspection_grade: null,
    });
  }

  return rows;
}

async function fetchNycOpenData(): Promise<DiscoveredRow[]> {
  const where = encodeURIComponent(
    `latitude >= ${bbox.south} AND latitude <= ${bbox.north} AND longitude >= ${bbox.west} AND longitude <= ${bbox.east}`,
  );
  const url = `${NYC_INSPECTIONS_URL}?$where=${where}&$limit=50000`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NYC Open Data failed: ${res.status}`);
  }

  const json = (await res.json()) as Array<Record<string, string>>;
  const rows: DiscoveredRow[] = [];
  const seenCamis = new Set<string>();

  for (const row of json) {
    const camis = row.camis?.trim();
    const name = row.dba?.trim();
    const lat = parseFloat(row.latitude ?? "");
    const lng = parseFloat(row.longitude ?? "");
    if (!camis || !name || Number.isNaN(lat) || Number.isNaN(lng)) continue;
    if (!inBbox(lat, lng)) continue;
    if (seenCamis.has(camis)) continue;
    seenCamis.add(camis);

    const cuisineRaw = row.cuisine_description?.trim();
    const cuisine_type = cuisineRaw
      ? cuisineRaw
          .toLowerCase()
          .split(/[,/]/)
          .map((c) => c.trim().replace(/\s+/g, "_"))
          .filter(Boolean)
          .slice(0, 6)
      : [];

    rows.push({
      name,
      slug: slugify(name, `nyc-${camis}`),
      lat,
      lng,
      address: buildAddressFromNyc(row),
      cuisine_type,
      source: "nyc_open_data",
      source_record_id: camis,
      import_confidence: 0.85,
      website_url: null,
      phone: null,
      health_inspection_grade: row.grade?.trim() || null,
    });
  }

  return rows;
}

type ExistingRecord = {
  id: string;
  name: string;
  slug: string;
  verification_status: string;
  source: string | null;
  source_record_id: string | null;
  lat: number;
  lng: number;
};

function bucketKey(lat: number, lng: number): string {
  return `${Math.floor(lat * 200)}:${Math.floor(lng * 200)}`;
}

/** M3: compact source-id map + PostGIS spatial lookup (cached per grid cell). */
class ImportDedup {
  private readonly bySourceId = new Map<string, ExistingRecord>();
  private readonly spatialCache = new Map<string, ExistingRecord[]>();
  restaurantCount = 0;

  get sourceIdCount(): number {
    return this.bySourceId.size;
  }

  async load(): Promise<void> {
    const { count, error: countError } = await supabase
      .from("restaurants")
      .select("id", { count: "exact", head: true });
    if (countError) throw new Error(`Failed to count restaurants: ${countError.message}`);
    this.restaurantCount = count ?? 0;

    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, verification_status, source, source_record_id")
        .not("source_record_id", "is", null)
        .range(from, from + pageSize - 1);

      if (error) throw new Error(`Failed to load source ids: ${error.message}`);
      if (!data?.length) break;

      for (const r of data) {
        if (!r.source || !r.source_record_id) continue;
        this.bySourceId.set(`${r.source}:${r.source_record_id}`, {
          id: r.id,
          name: r.name,
          slug: "",
          verification_status: r.verification_status,
          source: r.source,
          source_record_id: r.source_record_id,
          lat: 0,
          lng: 0,
        });
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }

    const { error: rpcError } = await supabase.rpc("find_nearby_for_import", {
      p_lat: 40.7,
      p_lng: -74,
      p_radius_meters: 1,
    });
    if (rpcError) {
      throw new Error(
        `Missing find_nearby_for_import RPC. Run:\n   npm run db:migrate:import-dedup\n\n(${rpcError.message})`,
      );
    }
  }

  private invalidateSpatialCache(lat: number, lng: number): void {
    const latCell = Math.floor(lat * 200);
    const lngCell = Math.floor(lng * 200);
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLng = -1; dLng <= 1; dLng++) {
        this.spatialCache.delete(`${latCell + dLat}:${lngCell + dLng}`);
      }
    }
  }

  private async getSpatialCandidates(lat: number, lng: number): Promise<ExistingRecord[]> {
    const key = bucketKey(lat, lng);
    const cached = this.spatialCache.get(key);
    if (cached) return cached;

    const { data, error } = await supabase.rpc("find_nearby_for_import", {
      p_lat: lat,
      p_lng: lng,
      p_radius_meters: SPATIAL_CACHE_RADIUS_M,
    });

    if (error) {
      throw new Error(`Spatial dedup RPC failed: ${error.message}`);
    }

    const records: ExistingRecord[] = (data ?? []).map(
      (r: {
        id: string;
        name: string;
        verification_status: string;
        source: string | null;
        source_record_id: string | null;
        lat: number;
        lng: number;
      }) => ({
        id: r.id,
        name: r.name,
        slug: "",
        verification_status: r.verification_status,
        source: r.source,
        source_record_id: r.source_record_id,
        lat: r.lat,
        lng: r.lng,
      }),
    );

    this.spatialCache.set(key, records);
    return records;
  }

  async find(row: DiscoveredRow): Promise<ExistingRecord | null> {
    const sourceHit = this.bySourceId.get(`${row.source}:${row.source_record_id}`);
    if (sourceHit) return sourceHit;

    const candidates = await this.getSpatialCandidates(row.lat, row.lng);
    for (const e of candidates) {
      const dist = haversineMeters(row.lat, row.lng, e.lat, e.lng);
      if (dist < SPATIAL_RADIUS_M && nameSimilarity(row.name, e.name) >= 0.72) {
        return e;
      }
    }
    return null;
  }

  registerInserted(pending: DiscoveredRow[], inserted: Array<{
    id: string;
    name: string;
    verification_status: string;
    source: string | null;
    source_record_id: string | null;
  }>): void {
    const byKey = new Map(pending.map((r) => [`${r.source}:${r.source_record_id}`, r]));
    for (const row of inserted) {
      if (!row.source || !row.source_record_id) continue;
      const orig = byKey.get(`${row.source}:${row.source_record_id}`);
      if (!orig) continue;
      this.bySourceId.set(`${row.source}:${row.source_record_id}`, {
        id: row.id,
        name: row.name,
        slug: "",
        verification_status: row.verification_status,
        source: row.source,
        source_record_id: row.source_record_id,
        lat: orig.lat,
        lng: orig.lng,
      });
      this.invalidateSpatialCache(orig.lat, orig.lng);
    }
  }
}

async function classifyRow(row: DiscoveredRow, dedup: ImportDedup): Promise<RowAction> {
  const dup = await dedup.find(row);
  if (!dup) return { type: "insert" };

  if (dup.verification_status === "verified" || dup.verification_status === "menu_indexed") {
    return { type: "protected" };
  }
  if (dup.source === row.source && dup.source_record_id === row.source_record_id) {
    return { type: "skip" };
  }
  const crossSource =
    (row.source === "nyc_open_data" && dup.source === "osm") ||
    (row.source === "osm" && dup.source === "nyc_open_data");
  if (crossSource) {
    return { type: "enrich", dup };
  }
  return { type: "skip" };
}

function rowToInsertPayload(row: DiscoveredRow, now: string) {
  return {
    name: row.name,
    slug: row.slug,
    location: createPoint(row.lng, row.lat),
    address: row.address,
    cuisine_type: row.cuisine_type,
    verification_status: "discovered" as const,
    agent_score: 0,
    source: row.source,
    source_record_id: row.source_record_id,
    import_confidence: row.import_confidence,
    discovered_at: now,
    last_external_update: now,
    website_url: row.website_url,
    phone: row.phone,
    health_inspection_grade: row.health_inspection_grade,
  };
}

async function applyEnrichment(
  row: DiscoveredRow,
  dup: ExistingRecord,
  stats: ImportStats,
): Promise<void> {
  if (dryRun) {
    stats.enriched++;
    return;
  }

  const updates: Record<string, unknown> = {
    last_external_update: new Date().toISOString(),
  };

  if (row.source === "nyc_open_data" && dup.source === "osm") {
    updates.health_inspection_grade = row.health_inspection_grade;
    updates.import_confidence = Math.max(0.75, row.import_confidence);
  } else if (row.source === "osm" && dup.source === "nyc_open_data") {
    if (row.website_url) updates.website_url = row.website_url;
    if (row.phone) updates.phone = row.phone;
    updates.import_confidence = Math.max(0.75, row.import_confidence);
  }

  const { error } = await supabase
    .from("restaurants")
    .update(updates)
    .eq("id", dup.id)
    .eq("verification_status", "discovered");
  if (!error) stats.enriched++;
}

async function insertSingleRow(
  row: DiscoveredRow,
  dedup: ImportDedup,
  stats: ImportStats,
): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("restaurants")
    .insert(rowToInsertPayload(row, now))
    .select("id, name, slug, verification_status, source, source_record_id")
    .single();

  if (error) {
    if (error.code === "23505") {
      stats.skipped++;
      return;
    }
    console.error(`  ✗ ${row.name}: ${error.message}`);
    return;
  }

  if (data) {
    dedup.registerInserted([row], [data]);
    stats.inserted++;
  }
}

async function flushInsertBatch(
  pending: DiscoveredRow[],
  dedup: ImportDedup,
  stats: ImportStats,
): Promise<void> {
  if (!pending.length) return;

  if (dryRun) {
    stats.inserted += pending.length;
    return;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("restaurants")
    .insert(pending.map((row) => rowToInsertPayload(row, now)))
    .select("id, name, slug, verification_status, source, source_record_id");

  if (!error && data?.length) {
    dedup.registerInserted(pending, data);
    stats.inserted += data.length;
    if (data.length < pending.length) {
      stats.skipped += pending.length - data.length;
    }
    return;
  }

  if (error?.code === "23505" && pending.length > 1) {
    const mid = Math.floor(pending.length / 2);
    await flushInsertBatch(pending.slice(0, mid), dedup, stats);
    await flushInsertBatch(pending.slice(mid), dedup, stats);
    return;
  }

  if (pending.length > 1) {
    for (const row of pending) {
      await insertSingleRow(row, dedup, stats);
    }
    return;
  }

  await insertSingleRow(pending[0], dedup, stats);
}

async function processRows(
  label: string,
  rows: DiscoveredRow[],
  dedup: ImportDedup,
  stats: ImportStats,
) {
  const total = rows.length;
  let processed = 0;
  let pending: DiscoveredRow[] = [];
  const started = Date.now();

  for (const row of rows) {
    const action = await classifyRow(row, dedup);

    switch (action.type) {
      case "skip":
        stats.skipped++;
        break;
      case "protected":
        stats.protected++;
        break;
      case "enrich":
        await applyEnrichment(row, action.dup, stats);
        break;
      case "insert":
        pending.push(row);
        if (pending.length >= BATCH_SIZE) {
          await flushInsertBatch(pending, dedup, stats);
          pending = [];
        }
        break;
    }

    processed++;
    if (processed % 100 === 0 || processed === total) {
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      const pct = ((processed / total) * 100).toFixed(0);
      console.log(
        `   ${label}: ${processed}/${total} (${pct}%) — inserted ${stats.inserted}, skipped ${stats.skipped} — ${elapsed}s`,
      );
    }
  }

  await flushInsertBatch(pending, dedup, stats);
}

async function recordImportRun(
  stats: ImportStats,
  sources: string[],
  runErrorMsg: string | null,
): Promise<void> {
  if (dryRun) return;
  const finishedAt = new Date().toISOString();
  const { error: insertError } = await supabase.from("import_runs").insert({
    region_key: region.key,
    sources,
    dry_run: false,
    finished_at: finishedAt,
    inserted: stats.inserted,
    skipped: stats.skipped,
    enriched: stats.enriched,
    protected: stats.protected,
    error: runErrorMsg,
  });
  if (insertError) {
    console.warn(`   (import_runs log skipped: ${insertError.message})`);
  }
}

async function main() {
  const startedAt = Date.now();
  const sources: string[] = [];
  if (!nycOnly && hasOsm) sources.push("osm");
  if (!osmOnly && hasNycOpenData) sources.push("nyc_open_data");

  let stats: ImportStats = { inserted: 0, skipped: 0, enriched: 0, protected: 0 };
  let runError: string | null = null;

  try {
    console.log(`\n📍 Discovered import — ${region.label} (${region.key})`);
    console.log(`   Bbox: ${bbox.south},${bbox.west} → ${bbox.north},${bbox.east}`);
    console.log(`   Sources: ${region.dataSources.join(", ")}`);
    if (dryRun) console.log("   Mode: DRY RUN (no writes)");
    if (!dryRun) console.log(`   Batch size: ${BATCH_SIZE} rows\n`);
    else console.log();

    if (!hasOsm && !nycOnly) {
      console.error("Region has no OSM source configured.");
      process.exit(1);
    }

    if (!dryRun) {
      const { error: probe } = await supabase.from("restaurants").select("source").limit(1);
      if (probe?.message?.includes("source")) {
        console.error(
          "\n❌ Missing provenance columns. Run first:\n   npm run db:migrate:discovered-layer\n",
        );
        process.exit(1);
      }
    }

    const dedup = new ImportDedup();
    await dedup.load();
    console.log(`   Existing restaurants in DB: ${dedup.restaurantCount}`);
    console.log(`   Source-id keys in memory: ${dedup.sourceIdCount}`);
    console.log(`   Dedup: M3 PostGIS (find_nearby_for_import)\n`);

    if (!nycOnly && hasOsm) {
      console.log("🗺  Fetching OpenStreetMap (Overpass)…");
      const osmRows = await fetchOverpass();
      console.log(`   ${osmRows.length} OSM venues in bbox`);
      console.log("   Writing OSM rows (progress every 100)…\n");
      await processRows("OSM", osmRows, dedup, stats);
    }

    if (!osmOnly && hasNycOpenData) {
      console.log("\n🏙  Fetching NYC Open Data (restaurant inspections, bbox)…");
      const nycRows = await fetchNycOpenData();
      console.log(`   ${nycRows.length} NYC records in bbox`);
      console.log("   Writing NYC rows (progress every 100)…\n");
      await processRows("NYC", nycRows, dedup, stats);
    } else if (!osmOnly && nycOnly) {
      console.log("\n⚠  Region has no nyc_open_data source; nothing to import with --nyc-only.");
    }
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    await recordImportRun(stats, sources, runError);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("\n✅ Import complete");
  console.log(`   Inserted:  ${stats.inserted}${dryRun ? " (would insert)" : ""}`);
  console.log(`   Skipped:   ${stats.skipped} (duplicate / already imported)`);
  console.log(`   Enriched:  ${stats.enriched} (cross-source merge)`);
  console.log(`   Protected: ${stats.protected} (verified/menu_indexed — not touched)`);
  console.log(`   Elapsed:   ${elapsed}s`);
  console.log(
    "\n   Attribution: OpenStreetMap © contributors (ODbL); NYC Open Data.\n",
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
