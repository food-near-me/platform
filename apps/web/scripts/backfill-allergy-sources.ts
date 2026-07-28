#!/usr/bin/env npx tsx
/**
 * Honest sources[] backfill for curated allergy seeds.
 *
 * Only writes method:"site" (or "menu") sources when the restaurant's own
 * website HTML contains allergy/GF evidence. Never fabricates call/visit.
 * Places with no site or no evidence are reported for human curator follow-up.
 *
 * Usage:
 *   npx tsx scripts/backfill-allergy-sources.ts --dry-run
 *   npx tsx scripts/backfill-allergy-sources.ts --write
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CURATED_TIERS,
  type CuratorSource,
  evaluateTierProvenance,
} from "../lib/allergy/source-provenance";

const CURATOR_ID = "curator:qbf";
const CHECKED_AT = new Date().toISOString();
const WRITE = process.argv.includes("--write");
const DRY = !WRITE || process.argv.includes("--dry-run");

const SEED_FILES = [
  "scripts/data/miami-allergy-seeds.json",
  "scripts/data/jacksonville-allergy-seeds.json",
];

type SeedPlace = {
  name: string;
  slug: string;
  website_url?: string | null;
  allergy_safety_tier: string;
  allergy_needs?: string[];
  allergy_safety_note?: string;
  sources?: CuratorSource[];
  [key: string]: unknown;
};

type SeedFile = {
  version?: number;
  region?: string;
  disclaimer?: string;
  places: SeedPlace[];
};

const EVIDENCE_PATTERNS: RegExp[] = [
  /gluten[-\s]?free/i,
  /celiac/i,
  /100%\s*gluten/i,
  /dedicated\s+(gluten|gf)/i,
  /allergen/i,
  /allergy\s+(friendly|aware|protocol|menu|info)/i,
  /dairy[-\s]?free/i,
  /nut[-\s]?free/i,
  /peanut[-\s]?free/i,
  /cross[-\s]?contact/i,
  /vegetarian/i,
  /vegan/i,
];

async function fetchText(url: string): Promise<{ ok: boolean; text: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "FoodNearMeSourceBackfill/1.0 (+https://foodnear.me; curator site check)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const text = await res.text();
    return { ok: res.ok, text: text.slice(0, 400_000), finalUrl: res.url || url };
  } catch {
    return { ok: false, text: "", finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

function evidenceHits(html: string): string[] {
  const hits: string[] = [];
  for (const re of EVIDENCE_PATTERNS) {
    if (re.test(html)) hits.push(re.source);
  }
  return hits;
}

function candidateUrls(website: string): string[] {
  let base: URL;
  try {
    base = new URL(website);
  } catch {
    return [];
  }
  const origin = base.origin;
  const paths = [
    base.href,
    `${origin}/`,
    `${origin}/allergens`,
    `${origin}/allergen`,
    `${origin}/allergen-info`,
    `${origin}/allergen-menu`,
    `${origin}/allergy`,
    `${origin}/allergies`,
    `${origin}/allergy-info`,
    `${origin}/gluten-free`,
    `${origin}/glutenfree`,
    `${origin}/gluten-free-menu`,
    `${origin}/nutrition`,
    `${origin}/dietary`,
    `${origin}/faq`,
    `${origin}/faqs`,
    `${origin}/menu`,
    `${origin}/about`,
    `${origin}/our-story`,
  ];
  // De-dupe while preserving order
  return [...new Set(paths.map((u) => u.replace(/\/$/, "") || u))];
}

async function findSiteEvidence(website: string): Promise<{
  url: string;
  hits: string[];
  method: "site" | "menu";
} | null> {
  for (const url of candidateUrls(website).slice(0, 10)) {
    const { ok, text, finalUrl } = await fetchText(url);
    if (!ok || !text) continue;
    const hits = evidenceHits(text);
    if (hits.length === 0) continue;
    const method = /menu/i.test(finalUrl) ? "menu" : "site";
    return { url: finalUrl, hits, method };
  }
  return null;
}

async function processFile(rel: string): Promise<{
  written: number;
  needsHuman: string[];
  skippedFresh: number;
}> {
  const abs = resolve(process.cwd(), rel);
  const file = JSON.parse(readFileSync(abs, "utf8")) as SeedFile;
  let written = 0;
  let skippedFresh = 0;
  const needsHuman: string[] = [];

  for (const place of file.places) {
    if (!CURATED_TIERS.has(place.allergy_safety_tier)) continue;

    const existing = evaluateTierProvenance(
      {
        name: place.name,
        allergy_safety_tier: place.allergy_safety_tier,
        sources: place.sources,
      },
      CHECKED_AT,
    );
    if (existing.ok && existing.tierVerifiedAt) {
      skippedFresh++;
      continue;
    }

    const site = place.website_url?.trim();
    if (!site) {
      needsHuman.push(`${place.slug} — no website_url (needs call/visit)`);
      continue;
    }

    process.stdout.write(`  checking ${place.slug} … `);
    const evidence = await findSiteEvidence(site);
    if (!evidence) {
      console.log("no allergy evidence on site");
      needsHuman.push(`${place.slug} — site reachable but no allergy keywords (${site})`);
      continue;
    }

    const source: CuratorSource = {
      method: evidence.method,
      url: evidence.url,
      checked_at: CHECKED_AT,
      curator_id: CURATOR_ID,
    };
    place.sources = [source];
    written++;
    console.log(`OK (${evidence.method}) hits=${evidence.hits.length} ${evidence.url}`);
  }

  if (WRITE && !DRY) {
    writeFileSync(abs, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  }

  return { written, needsHuman, skippedFresh };
}

async function main() {
  console.log(
    `[backfill-allergy-sources] mode=${WRITE && !DRY ? "WRITE" : "DRY-RUN"} curator=${CURATOR_ID} at=${CHECKED_AT}`,
  );
  const allHuman: string[] = [];
  let totalWritten = 0;
  let totalSkipped = 0;

  for (const rel of SEED_FILES) {
    console.log(`\n== ${rel}`);
    const { written, needsHuman, skippedFresh } = await processFile(rel);
    totalWritten += written;
    totalSkipped += skippedFresh;
    allHuman.push(...needsHuman.map((h) => `${rel}: ${h}`));
  }

  console.log("\n── summary ──");
  console.log(`fresh sources added: ${totalWritten}`);
  console.log(`already fresh:       ${totalSkipped}`);
  console.log(`needs human:         ${allHuman.length}`);
  if (allHuman.length) {
    console.log("\nHuman curator follow-up (call/visit):");
    for (const line of allHuman) console.log(`  - ${line}`);
  }
  if (!WRITE || DRY) {
    console.log("\nDry run only — re-run with --write to persist sources[] into seed JSON.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
