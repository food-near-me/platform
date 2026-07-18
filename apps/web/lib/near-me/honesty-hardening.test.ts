/**
 * Semantic honesty sentinels (Phase-1 hardening).
 *
 * These guard the DATA, not table-name strings: a safety tier must never appear
 * as a public aggregate/count, a telemetry dimension, a denylist predicate, or an
 * unconditional freshness bump. Each corresponds to a red-team objection (O13/O14/
 * O16/O17) that was a LIVE breach in main and must not regress.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { extractTierLabel } from "@/lib/mcp/instrumentation";
import { curatedTierLabel, CURATED_TIERS } from "./rank";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// O13 — the public /health/mcp dashboard aggregates tier_returned into a per-tier
// count. A curated allergy safety_tier must NEVER become that instrumented dimension.
test("O13: extractTierLabel never emits an allergy safety_tier into the usage count", () => {
  for (const tier of [...CURATED_TIERS, "unknown"]) {
    assert.equal(
      extractTierLabel({ safety_tier: tier }),
      null,
      `safety_tier "${tier}" must not become a public tier_returned dimension`,
    );
  }
  // A real verification_status still records (that dimension is allowed).
  assert.equal(extractTierLabel({ verification_status: "verified" }), "verified");
});

// O17 — a curated surface must fail loud on a non-whitelist tier, not silently
// coerce a typo'd/fooled hand-edit ("strong_protcol") into a curated pill.
test("O17: curatedTierLabel refuses a non-whitelist tier, labels a curated one", () => {
  for (const tier of CURATED_TIERS) {
    assert.equal(typeof curatedTierLabel(tier), "string");
  }
  for (const bad of ["unknown", "strong_protcol", "", "verified"]) {
    assert.throws(
      () => curatedTierLabel(bad),
      /non-curated tier/,
      `curatedTierLabel("${bad}") must throw on a curated surface`,
    );
  }
});

// O16 — no machine-readable public COUNT of safety-tiered places.
test("O16: no public aggregate count of curated tiers ships", () => {
  const hood = read("../../app/near-me/[city]/[neighborhood]/page.tsx");
  const api = read("../../app/api/v1/near-me/route.ts");
  assert.ok(
    !/numberOfItems\s*:/.test(hood),
    "neighborhood JSON-LD must not emit numberOfItems (a public count of tiered places)",
  );
  assert.ok(
    !/curated_matches\s*:/.test(api),
    "the near-me API must not emit curated_matches (a public count of tiered places)",
  );
});

// O17 — the place-page curated-nearby query must use the CURATED_TIERS whitelist,
// never a `<> 'unknown'` denylist that lets a stray tier through.
test("O17: no `<> 'unknown'` denylist used as a curation predicate", () => {
  const page = read("../../app/place/[slug]/page.tsx");
  assert.ok(
    !/allergy_safety_tier\s*<>\s*'unknown'/.test(page),
    "curated surfaces must filter with an IN (...curated...) whitelist, not `<> 'unknown'`",
  );
});

// O14 — a reseed with no real change must not bump either freshness clock. The
// seed loader must guard both timestamp columns, never set them unconditionally.
test("O14: seed loader does not bump freshness timestamps unconditionally", () => {
  const seed = read("../../scripts/seed-allergy-beachhead.ts");
  assert.ok(
    !/allergy_updated_at\s*=\s*NOW\(\)/.test(seed),
    "allergy_updated_at must be CASE-guarded on a safety-field diff, not `= NOW()`",
  );
  assert.ok(
    !/last_external_update\s*=\s*NOW\(\)/.test(seed),
    "last_external_update must be CASE-guarded on a contact-field diff, not `= NOW()`",
  );
});
