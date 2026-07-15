#!/usr/bin/env npx tsx
/**
 * Backfill opening_hours / phone / website / address on discovered OSM rows
 * from a fresh Overpass pull (matched on source + source_record_id).
 *
 * Usage:
 *   npx tsx scripts/enrich-discovered-from-osm.ts --region=miami
 *   npx tsx scripts/enrich-discovered-from-osm.ts --region=miami --dry-run
 *
 * Env: DATABASE_URL in apps/web/.env.local
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { createNeonDbClient } from "../lib/db/compat";
import { getSql, isDatabaseConfigured } from "../lib/db/neon";
import {
  resolveRegion,
  type Bbox,
} from "./lib/load-import-regions.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const regionArg = args.find((a) => a.startsWith("--region="));
const region = resolveRegion(regionArg?.split("=")[1]);
const bbox: Bbox = region.bbox;

if (!isDatabaseConfigured()) {
  console.error("Missing DATABASE_URL in .env.local");
  process.exit(1);
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

type OsmTags = {
  name?: string;
  phone?: string;
  "contact:phone"?: string;
  website?: string;
  "contact:website"?: string;
  opening_hours?: string;
  "addr:housenumber"?: string;
  "addr:street"?: string;
  "addr:city"?: string;
  "addr:postcode"?: string;
  "addr:state"?: string;
};

type OverpassElement = {
  type: string;
  id: number;
  tags?: OsmTags;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildQuery(b: Bbox): string {
  return `
[out:json][timeout:180];
(
  node["amenity"~"restaurant|cafe|fast_food|bar|pub|biergarten|food_court|ice_cream"](${b.south},${b.west},${b.north},${b.east});
  way["amenity"~"restaurant|cafe|fast_food|bar|pub|biergarten|food_court|ice_cream"](${b.south},${b.west},${b.north},${b.east});
  node["shop"="bakery"](${b.south},${b.west},${b.north},${b.east});
  way["shop"="bakery"](${b.south},${b.west},${b.north},${b.east});
  node["restaurant"="yes"](${b.south},${b.west},${b.north},${b.east});
  way["restaurant"="yes"](${b.south},${b.west},${b.north},${b.east});
);
out tags;
`;
}

function buildAddress(tags: OsmTags): string | null {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
    tags["addr:state"] && tags["addr:postcode"]
      ? `${tags["addr:state"]} ${tags["addr:postcode"]}`
      : tags["addr:postcode"] || tags["addr:state"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

async function fetchOverpass(): Promise<Map<string, OsmTags>> {
  const query = buildQuery(bbox);
  const retryDelaysMs = [0, 5000, 15000, 45000];
  let elements: OverpassElement[] = [];

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    if (retryDelaysMs[attempt] > 0) {
      console.log(`   Overpass retry in ${retryDelaysMs[attempt] / 1000}s…`);
      await sleep(retryDelaysMs[attempt]);
    }
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": "FoodNearMe/1.0 (hours enrich)",
          },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (res.ok) {
          const json = (await res.json()) as { elements: OverpassElement[] };
          elements = json.elements ?? [];
          break;
        }
        if (![429, 502, 504].includes(res.status)) {
          throw new Error(`Overpass ${res.status}`);
        }
      } catch (err) {
        if (attempt === retryDelaysMs.length - 1) {
          throw err instanceof Error ? err : new Error(String(err));
        }
      }
    }
    if (elements.length) break;
  }

  const map = new Map<string, OsmTags>();
  for (const el of elements) {
    if (!el.tags?.name) continue;
    map.set(`${el.type}/${el.id}`, el.tags);
  }
  return map;
}

async function main() {
  console.log(`\n Enrich discovered from OSM — ${region.label} (${region.key})`);
  if (dryRun) console.log("   Mode: DRY RUN\n");

  console.log(" Fetching Overpass tags…");
  const osm = await fetchOverpass();
  console.log(`   ${osm.size} OSM elements with names`);

  const db = createNeonDbClient();
  const { data: rows, error } = await db
    .from("restaurants")
    .select("id, source, source_record_id, phone, website_url, address, opening_hours")
    .eq("source", "osm")
    .eq("verification_status", "discovered");

  if (error) throw new Error(error.message);
  const list = (rows ?? []) as Array<{
    id: string;
    source: string;
    source_record_id: string | null;
    phone: string | null;
    website_url: string | null;
    address: string | null;
    opening_hours: string | null;
  }>;

  // Filter to region bbox via source_record_id present in Overpass pull
  let updated = 0;
  let matched = 0;
  let withHours = 0;
  const sql = getSql();

  for (const row of list) {
    if (!row.source_record_id) continue;
    const tags = osm.get(row.source_record_id);
    if (!tags) continue;
    matched++;

    const phone = tags.phone || tags["contact:phone"] || null;
    const website = tags.website || tags["contact:website"] || null;
    const hours = tags.opening_hours?.trim() || null;
    const address = buildAddress(tags);

    const patch: Record<string, unknown> = {};
    if (hours && hours !== row.opening_hours) patch.opening_hours = hours;
    if (phone && !row.phone) patch.phone = phone;
    if (website && !row.website_url) patch.website_url = website;
    if (address && !row.address) patch.address = address;

    if (!Object.keys(patch).length) {
      if (hours) withHours++;
      continue;
    }
    if (hours) withHours++;

    if (dryRun) {
      updated++;
      continue;
    }

    const keys = Object.keys(patch);
    const sets = keys.map((k, i) => `"${k}" = $${i + 2}`).join(", ");
    const params = [row.id, ...keys.map((k) => patch[k])];
    await sql.query(
      `UPDATE restaurants SET ${sets}, last_external_update = NOW() WHERE id = $1::uuid`,
      params,
    );
    updated++;
  }

  console.log(`\n Done`);
  console.log(`   Matched OSM ids in DB: ${matched}`);
  console.log(`   Rows updated:          ${updated}${dryRun ? " (would)" : ""}`);
  console.log(`   With opening_hours:    ${withHours}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
