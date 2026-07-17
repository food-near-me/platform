#!/usr/bin/env npx tsx
/**
 * Upsert curated allergy beachhead places into Neon.
 *
 * Usage:
 *   npx tsx scripts/seed-allergy-beachhead.ts --region=miami
 *   npx tsx scripts/seed-allergy-beachhead.ts --region=jacksonville
 *   npx tsx scripts/seed-allergy-beachhead.ts --region=jacksonville --dry-run
 *
 * Env: DATABASE_URL in apps/web/.env.local
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { getSql, isDatabaseConfigured } from "../lib/db/neon";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const dryRun = process.argv.includes("--dry-run");
const regionArg = process.argv.find((a) => a.startsWith("--region="));
const region = (regionArg?.split("=")[1] || "miami").toLowerCase();

const REGION_FILES: Record<string, string> = {
  miami: "miami-allergy-seeds.json",
  jacksonville: "jacksonville-allergy-seeds.json",
};

type SeedPlace = {
  name: string;
  slug: string;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  cuisine_type: string[];
  opening_hours: string | null;
  allergy_needs: string[];
  allergy_safety_tier: "dedicated" | "strong_protocol" | "shared_verify" | "unknown";
  allergy_safety_note: string;
};

type SeedFile = {
  places: SeedPlace[];
  disclaimer: string;
};

function createPoint(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

async function main() {
  if (!isDatabaseConfigured()) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const fileName = REGION_FILES[region];
  if (!fileName) {
    console.error(
      `Unknown region "${region}". Use: ${Object.keys(REGION_FILES).join(", ")}`,
    );
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), "scripts/data", fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing seed file: ${filePath}`);
    process.exit(1);
  }

  const seed = JSON.parse(fs.readFileSync(filePath, "utf8")) as SeedFile;
  console.log(`\n🌱 ${region} allergy seed (${seed.places.length} places)`);
  if (dryRun) console.log("   DRY RUN\n");

  const sql = getSql();
  let inserted = 0;
  let updated = 0;

  for (const p of seed.places) {
    const existing = (await sql.query(
      `SELECT id, slug FROM restaurants
       WHERE slug = $1
          OR (
            lower(name) = lower($2)
            AND ST_DWithin(
              location,
              ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
              120
            )
          )
       LIMIT 1`,
      [p.slug, p.name, p.lng, p.lat],
    )) as { id: string; slug: string }[];

    if (existing[0]) {
      if (dryRun) {
        updated++;
        console.log(`  update ${p.name}`);
        continue;
      }
      await sql.query(
        `UPDATE restaurants SET
           name = $2,
           slug = $3,
           address = COALESCE($4, address),
           phone = COALESCE($5, phone),
           website_url = COALESCE($6, website_url),
           cuisine_type = $7::text[],
           opening_hours = COALESCE($8, opening_hours),
           location = ST_GeogFromText($9),
           allergy_needs = $10::text[],
           allergy_safety_tier = $11,
           allergy_safety_note = $12,
           allergy_updated_at = NOW(),
           last_external_update = NOW()
         WHERE id = $1::uuid`,
        [
          existing[0].id,
          p.name,
          p.slug,
          p.address,
          p.phone,
          p.website_url,
          p.cuisine_type,
          p.opening_hours,
          createPoint(p.lng, p.lat),
          p.allergy_needs,
          p.allergy_safety_tier,
          p.allergy_safety_note,
        ],
      );
      updated++;
      console.log(`  ✓ updated ${p.name}`);
    } else {
      if (dryRun) {
        inserted++;
        console.log(`  insert ${p.name}`);
        continue;
      }
      await sql.query(
        `INSERT INTO restaurants (
           name, slug, location, address, cuisine_type, verification_status,
           agent_score, source, source_record_id, import_confidence,
           website_url, phone, opening_hours,
           allergy_needs, allergy_safety_tier, allergy_safety_note, allergy_updated_at,
           discovered_at, last_external_update
         ) VALUES (
           $1, $2, ST_GeogFromText($3), $4, $5::text[], 'discovered',
           0, 'allergy_curated', $6, 0.95,
           $7, $8, $9,
           $10::text[], $11, $12, NOW(),
           NOW(), NOW()
         )`,
        [
          p.name,
          p.slug,
          createPoint(p.lng, p.lat),
          p.address,
          p.cuisine_type,
          `allergy/${p.slug}`,
          p.website_url,
          p.phone,
          p.opening_hours,
          p.allergy_needs,
          p.allergy_safety_tier,
          p.allergy_safety_note,
        ],
      );
      inserted++;
      console.log(`  + inserted ${p.name}`);
    }
  }

  console.log(`\nDone. inserted=${inserted} updated=${updated}`);
  console.log(`Note: ${seed.disclaimer.slice(0, 120)}…\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
