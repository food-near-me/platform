import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { isPickupOnly, ogTierBadge, rankPlaces, type RankablePlace } from "./rank";

/** Minimal curated place; override only what a case cares about. */
function place(over: Partial<RankablePlace> & { name: string }): RankablePlace {
  return {
    id: over.name.toLowerCase().replace(/\s+/g, "-"),
    slug: over.name.toLowerCase().replace(/\s+/g, "-"),
    distance_meters: 1609, // ~1 mi
    cuisine_type: [],
    verification_status: "listed",
    menu_available: false,
    address: "100 Test St",
    website_url: null,
    phone: null,
    opening_hours: null, // keep hours out of the ranking math (deterministic)
    data_source: "curated",
    allergy_needs: [],
    allergy_safety_tier: "unknown",
    allergy_safety_note: null,
    ...over,
  };
}

test("need filter drops an uncurated mega-chain (no Domino's padding)", () => {
  const ranked = rankPlaces(
    [
      place({ name: "Dominos", cuisine_type: ["pizza"] }),
      place({
        name: "Foo Dog GF",
        allergy_needs: ["gluten_free"],
        allergy_safety_tier: "dedicated",
      }),
    ],
    { need: "gluten_free" },
  );
  const names = ranked.map((p) => p.name);
  assert.ok(!names.includes("Dominos"), "mega-chain must be dropped under a need filter");
  assert.ok(names.includes("Foo Dog GF"), "curated GF match must survive");
});

test("a curated mega-chain that matches the need survives (Chipotle)", () => {
  const ranked = rankPlaces(
    [
      place({
        name: "Chipotle Mexican Grill",
        allergy_needs: ["gluten_free", "nut_aware"],
        allergy_safety_tier: "strong_protocol",
      }),
    ],
    { need: "gluten_free" },
  );
  assert.equal(ranked.length, 1, "curated chain with matching need is kept");
  assert.equal(ranked[0].name, "Chipotle Mexican Grill");
});

test("pizza + GF surfaces curated GF pizza above a GF bakery", () => {
  const ranked = rankPlaces(
    [
      place({
        name: "GF Bakery",
        cuisine_type: ["bakery", "dessert"],
        allergy_needs: ["gluten_free"],
        allergy_safety_tier: "dedicated",
      }),
      place({
        name: "GF Pizza",
        cuisine_type: ["pizza", "italian"],
        allergy_needs: ["gluten_free"],
        allergy_safety_tier: "dedicated",
      }),
    ],
    { need: "gluten_free", query: "pizza" },
  );
  assert.equal(ranked[0].name, "GF Pizza", "cuisine match should lead for a pizza query");
});

test("pickup-only place does not outrank a closer dedicated storefront", () => {
  const ranked = rankPlaces(
    [
      place({
        name: "EBTG Pickup",
        address: "Order-ahead pickup only, no walk-in storefront — verify current address.",
        distance_meters: 0, // parked at centroid
        allergy_needs: ["gluten_free"],
        allergy_safety_tier: "dedicated",
      }),
      place({
        name: "Real Storefront GF",
        address: "200 Real Ave",
        distance_meters: 3218, // ~2 mi
        allergy_needs: ["gluten_free"],
        allergy_safety_tier: "dedicated",
      }),
    ],
    { need: "gluten_free" },
  );
  assert.equal(
    ranked[0].name,
    "Real Storefront GF",
    "a real nearby storefront must beat a centroid-pinned pickup spot",
  );
  assert.ok(
    ranked.some((p) => p.name === "EBTG Pickup"),
    "pickup spot is still surfaced, just not falsely #1",
  );
});

test("unknown-tier place with an allergy tag must NOT match a need filter", () => {
  const ranked = rankPlaces(
    [
      place({
        name: "Uncurated GF Claim",
        allergy_needs: ["gluten_free"],
        allergy_safety_tier: "unknown", // tagged but never curated
      }),
      place({
        name: "Curated GF",
        allergy_needs: ["gluten_free"],
        allergy_safety_tier: "dedicated",
      }),
    ],
    { need: "gluten_free" },
  );
  const uncurated = ranked.find((p) => p.name === "Uncurated GF Claim");
  assert.ok(
    !uncurated || uncurated.matches_need === false,
    "an unknown-tier place must never count as a curated need match",
  );
  assert.equal(ranked[0]?.name, "Curated GF", "only the curated place leads");
});

test("isPickupOnly detects no-storefront markers, not normal addresses", () => {
  assert.equal(isPickupOnly({ address: "Order-ahead pickup only. Jacksonville, FL" }), true);
  assert.equal(isPickupOnly({ address: "No walk-in — order ahead" }), true);
  assert.equal(isPickupOnly({ address: "826 Lomax St, Jacksonville, FL" }), false);
  assert.equal(isPickupOnly({ address: null }), false);
});

// --- OG / share-card honesty: uncurated listings never earn a curated badge ---

test("ogTierBadge returns no pill for uncurated / unknown / stray tiers", () => {
  assert.equal(ogTierBadge("unknown"), undefined, "unknown tier must not earn a badge");
  assert.equal(ogTierBadge(null), undefined, "null tier must not earn a badge");
  assert.equal(ogTierBadge(undefined), undefined, "missing tier must not earn a badge");
  assert.equal(ogTierBadge(""), undefined, "empty tier must not earn a badge");
  assert.equal(ogTierBadge("bogus"), undefined, "an out-of-whitelist value must not earn a badge");
});

test("ogTierBadge shows the real label ONLY for curated tiers", () => {
  assert.equal(ogTierBadge("dedicated"), "Dedicated / specialty facility");
  assert.equal(ogTierBadge("strong_protocol"), "Strong allergy protocols (shared kitchen)");
  assert.equal(ogTierBadge("shared_verify"), "Shared kitchen — verify before you go");
});

// Regression sentinel: the per-place OG/metadata surfaces must NEVER reintroduce a
// hardcoded curated default (the root cause of the 2026-07 OSM mislabel). This fails
// loudly if someone re-adds a fabricated "curated" claim on an uncurated presentation path.
test("no per-place OG/metadata surface hardcodes a curated claim", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const og = read("../../app/place/[slug]/opengraph-image.tsx");
  const page = read("../../app/place/[slug]/page.tsx");

  assert.ok(
    !/Curated · human-checked/.test(og),
    "opengraph-image must not hardcode the 'Curated · human-checked' badge — route through ogTierBadge()",
  );
  assert.ok(
    !/curated allergy-aware spot/i.test(og),
    "opengraph-image alt must stay tier-neutral, not claim 'curated allergy-aware'",
  );
  assert.ok(
    /ogTierBadge/.test(og),
    "opengraph-image must derive its badge from ogTierBadge() (shared curated whitelist)",
  );
  assert.ok(
    !/curated allergy notes when available/i.test(page),
    "place metadata description must not claim curated notes for uncurated listings",
  );
});
