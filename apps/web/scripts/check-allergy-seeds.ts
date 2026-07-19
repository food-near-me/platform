#!/usr/bin/env npx tsx
/**
 * C5 — CI provenance gate for allergy seed data.
 *
 * Fails when a PR/commit ADDS or CHANGES a curated place's tier or note without a
 * fresh curator source. This enforces the same rule as the C4 seed loader, but at
 * PR time, so a safety-claim change can never merge without provenance.
 *
 * Diff-aware on purpose: it validates only what CHANGED against the base ref, so a
 * tier/note edit is gated while legacy places that predate the gate are not
 * retroactively blocked — they're validated the next time they're touched (e.g.
 * when their sources are backfilled). Pure git + files; no DB / network.
 *
 * Usage: npm run check:allergy-seeds
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CURATED_TIERS, evaluateTierProvenance } from "../lib/allergy/source-provenance";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

const SEED_FILES = [
  "apps/web/scripts/data/miami-allergy-seeds.json",
  "apps/web/scripts/data/jacksonville-allergy-seeds.json",
];

type SeedPlace = {
  slug: string;
  name: string;
  allergy_safety_tier: string;
  allergy_safety_note?: string;
  sources?: unknown;
};

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/** Resolve a base ref to diff against: PR target, else the previous commit. */
function baseRef(): string | null {
  const prBase = process.env.GITHUB_BASE_REF;
  const candidates = [
    ...(prBase ? [`origin/${prBase}`, prBase] : []),
    "HEAD^",
    "origin/main",
    "main",
  ];
  for (const cand of candidates) {
    if (git(["rev-parse", "--verify", "--quiet", `${cand}^{commit}`]) !== null) return cand;
  }
  return null;
}

function parsePlaces(text: string | null): Map<string, SeedPlace> {
  const map = new Map<string, SeedPlace>();
  if (!text) return map;
  try {
    const json = JSON.parse(text) as { places?: SeedPlace[] };
    for (const p of json.places ?? []) map.set(p.slug, p);
  } catch {
    // Unreadable/absent base version → treat as empty (all head places count as new).
  }
  return map;
}

function main(): void {
  const base = baseRef();
  const nowIso = new Date().toISOString();
  const failures: string[] = [];
  let changed = 0;

  console.log(
    `[check:allergy-seeds] base=${base ?? "(none — validating only places that declare sources)"}`,
  );

  for (const rel of SEED_FILES) {
    let headText: string | null = null;
    try {
      headText = readFileSync(resolve(repoRoot, rel), "utf8");
    } catch {
      continue; // seed file absent
    }
    const head = parsePlaces(headText);
    const baseMap = base ? parsePlaces(git(["show", `${base}:${rel}`])) : null;

    for (const [slug, place] of head) {
      if (!CURATED_TIERS.has(place.allergy_safety_tier)) continue;

      // Which curated places to enforce on:
      //  - with a base: those that are NEW or whose tier/note CHANGED.
      //  - without a base (shallow clone, no history): soft mode — only places
      //    that already declare a `sources` field, so we never block on legacy
      //    but a declared source must still be valid/fresh.
      let mustCheck: boolean;
      if (baseMap) {
        const before = baseMap.get(slug);
        mustCheck =
          !before ||
          before.allergy_safety_tier !== place.allergy_safety_tier ||
          (before.allergy_safety_note ?? "") !== (place.allergy_safety_note ?? "");
      } else {
        mustCheck = Array.isArray(place.sources);
      }
      if (!mustCheck) continue;

      changed++;
      const verdict = evaluateTierProvenance(
        {
          name: place.name,
          allergy_safety_tier: place.allergy_safety_tier,
          sources: Array.isArray(place.sources) ? (place.sources as never) : undefined,
        },
        nowIso,
      );
      if (!verdict.ok) failures.push(`${rel} → ${place.name}: ${verdict.reason}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\nFAIL: ${failures.length} changed curated place(s) lack a fresh source:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error(
      "\nA changed tier/note needs a fresh sources[] entry (method + curator_id + " +
        "checked_at within 180 days) before it can merge.",
    );
    process.exit(1);
  }

  console.log(`OK  ${changed} changed curated place(s) carry a fresh source.`);
}

main();
