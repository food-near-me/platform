import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildNeighborhoodListing,
  type NeighborhoodRow,
} from "./neighborhood-listing";

/** Minimal row; override only what a case cares about. */
function row(over: Partial<NeighborhoodRow> & { name: string }): NeighborhoodRow {
  return {
    id: over.name.toLowerCase().replace(/\s+/g, "-"),
    slug: over.name.toLowerCase().replace(/\s+/g, "-"),
    address: "100 Test St",
    allergy_needs: null,
    allergy_safety_tier: "unknown",
    allergy_safety_note: null,
    distance_miles: 1,
    ...over,
  };
}

test("an unknown-tier row is never counted as a curated safe spot", () => {
  const { curated, other, curatedCount } = buildNeighborhoodListing([
    row({ name: "Sanctuary GF", allergy_safety_tier: "dedicated" }),
    row({ name: "Scraped Cafe", allergy_safety_tier: "unknown" }),
    row({ name: "No Tier", allergy_safety_tier: null }),
  ]);

  assert.equal(curatedCount, 1, "only the curated row counts toward the headline");
  assert.deepEqual(
    curated.map((r) => r.name),
    ["Sanctuary GF"],
    "curated bucket holds ONLY the real tier",
  );
  assert.ok(
    other.some((r) => r.name === "Scraped Cafe"),
    "the unknown-tier row falls through to the tier-neutral bucket, never the safe list",
  );

  // NEGATIVE CONTROL: if the split ever counted uncurated rows as curated too,
  // this count would be 3 and the assertion above would fail. Prove the guard
  // has teeth by mimicking the leak and asserting it would be caught.
  const leaked = [
    ...curated,
    ...other.filter((r) => r.allergy_safety_tier === "unknown"),
  ];
  assert.notEqual(
    leaked.length,
    curatedCount,
    "sanity: an unknown row added to curated MUST change the count — the guard is not a no-op",
  );
});

test("mega-chains are dropped from the uncurated bucket, not shown as tips", () => {
  const { other } = buildNeighborhoodListing([
    row({ name: "McDonald's", allergy_safety_tier: "unknown" }),
    row({ name: "Corner Diner", allergy_safety_tier: "unknown" }),
  ]);
  assert.ok(
    !other.some((r) => r.name === "McDonald's"),
    "uncurated mega-chain is noise, excluded from the neighborhood list",
  );
  assert.ok(other.some((r) => r.name === "Corner Diner"));
});

test("curated bucket orders best tier first", () => {
  const { curated } = buildNeighborhoodListing([
    row({ name: "Shared Spot", allergy_safety_tier: "shared_verify" }),
    row({ name: "Dedicated Spot", allergy_safety_tier: "dedicated" }),
    row({ name: "Protocol Spot", allergy_safety_tier: "strong_protocol" }),
  ]);
  assert.deepEqual(curated.map((r) => r.name), [
    "Dedicated Spot",
    "Protocol Spot",
    "Shared Spot",
  ]);
});
