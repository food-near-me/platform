import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  evaluateTierProvenance,
  newestFreshSource,
  SOURCE_STALE_DAYS,
  type CuratorSource,
} from "./source-provenance";

// Fixed clock — the gate takes `now` as an argument precisely so tests are
// deterministic (no ambient Date).
const NOW = "2026-07-18T00:00:00.000Z";
const fresh: CuratorSource = {
  method: "call",
  checked_at: "2026-06-01T00:00:00.000Z", // 47 days old — within 180
  curator_id: "curator:qbf",
};
const stale: CuratorSource = {
  method: "site",
  checked_at: "2025-01-01T00:00:00.000Z", // >180 days old
  curator_id: "curator:qbf",
};
const future: CuratorSource = {
  method: "visit",
  checked_at: "2026-09-01T00:00:00.000Z", // future-dated — never counts
  curator_id: "curator:qbf",
};

// --- The keystone negative control: a curated tier with no fresh source aborts.
test("a curated place with NO source fails the gate", () => {
  const verdict = evaluateTierProvenance(
    { name: "No Source Café", allergy_safety_tier: "dedicated", sources: [] },
    NOW,
  );
  assert.equal(verdict.ok, false);
});

test("a curated place with only a STALE source fails the gate", () => {
  const verdict = evaluateTierProvenance(
    { name: "Stale Café", allergy_safety_tier: "strong_protocol", sources: [stale] },
    NOW,
  );
  assert.equal(verdict.ok, false);
});

test("a future-dated source does NOT satisfy the gate", () => {
  const verdict = evaluateTierProvenance(
    { name: "Future Café", allergy_safety_tier: "shared_verify", sources: [future] },
    NOW,
  );
  assert.equal(verdict.ok, false);
});

test("a curated place with a fresh source passes and reports tier_verified_at", () => {
  const verdict = evaluateTierProvenance(
    { name: "Good Café", allergy_safety_tier: "dedicated", sources: [fresh] },
    NOW,
  );
  assert.deepEqual(verdict, { ok: true, tierVerifiedAt: fresh.checked_at });
});

test("an 'unknown' tier needs no source (tier_verified_at is null)", () => {
  const verdict = evaluateTierProvenance(
    { name: "Unknown Café", allergy_safety_tier: "unknown", sources: [] },
    NOW,
  );
  assert.deepEqual(verdict, { ok: true, tierVerifiedAt: null });
});

test("tier_verified_at is the NEWEST fresh source's checked_at", () => {
  const older: CuratorSource = { ...fresh, checked_at: "2026-05-01T00:00:00.000Z" };
  const newer: CuratorSource = { ...fresh, checked_at: "2026-07-01T00:00:00.000Z" };
  assert.equal(
    newestFreshSource([older, newer, stale, future], NOW),
    newer.checked_at,
  );
});

test("a source missing curator_id or method is ignored", () => {
  const noCurator = { method: "call", checked_at: fresh.checked_at, curator_id: "" };
  const noMethod = { method: "", checked_at: fresh.checked_at, curator_id: "x" };
  assert.equal(
    newestFreshSource([noCurator as CuratorSource, noMethod as CuratorSource], NOW),
    null,
  );
});

test("the staleness window is the C4 decision value (180 days)", () => {
  assert.equal(SOURCE_STALE_DAYS, 180);
});

// --- Grep sentinel: a curator SIGNAL is never a citation (red-team O4). Seed
// data may cite curator sources but must never launder the content-free signal
// stream into a provenance record. Forbid the identifier under scripts/data/**.
test("no seed data file references `curator_signals` (a signal is not a source)", () => {
  const testDir = dirname(fileURLToPath(import.meta.url));
  const dataDir = resolve(testDir, "../../scripts/data"); // apps/web/scripts/data
  const offenders: string[] = [];
  for (const entry of readdirSync(dataDir)) {
    const full = resolve(dataDir, entry);
    if (!statSync(full).isFile()) continue;
    if (/curator_signals/.test(readFileSync(full, "utf8"))) offenders.push(entry);
  }
  assert.deepEqual(offenders, [], "seed data must never cite curator_signals as a source");
});
