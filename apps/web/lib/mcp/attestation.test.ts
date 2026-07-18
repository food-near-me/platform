import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateSigningKeyPair,
  verifyMenuSignature,
} from "@foodnearme/menu-protocol";

import { CURATED_TIERS } from "@/lib/near-me/rank";
import {
  buildSafetyAttestation,
  buildSafetyDisclosure,
  canonicalizeSafetyClaim,
  SAFETY_ATTESTATION_SCHEME,
  toIsoAsOf,
  type SigningKey,
} from "./attestation";

function testKey(): SigningKey {
  const { privateKeyPem, publicKeyPem, publicKeyFingerprint } = generateSigningKeyPair();
  return { privateKeyPem, publicKeyPem, publicKeyFingerprint };
}

// --- The honesty gate: an uncurated place NEVER carries a tier claim ---

test("attestation emits NOTHING tier-related for an uncurated (unknown) place", () => {
  const att = buildSafetyAttestation(
    { restaurant_id: "x", tier: "unknown", as_of: null },
    { signingKey: testKey() }, // key present, but must still refuse to sign
  );
  assert.equal(att.safety_tier, "unknown");
  assert.equal(att.curated, false);
  assert.equal(att.attestation, undefined, "must not attach an attestation to a non-claim");
  assert.equal(att.signing_status, undefined, "unknown place has no signing status");
  assert.equal(att.as_of, undefined, "must not surface a curation timestamp for an unknown place");
  assert.equal(att.allergy_needs, undefined, "must not surface needs for an unknown place");
  assert.match(att.advisory ?? "", /verify with the restaurant/i);
});

test("a scraped note passed for an uncurated tier is DROPPED, never surfaced as vetting", () => {
  // The place page's "Why this rating" note renders from disclosure.allergy_safety_note.
  // A scraped OSM note on an unknown-tier row must never reach that surface — else it
  // reads as a human vetting finding for a place we never vetted (the 2026-07 mislabel).
  const d = buildSafetyDisclosure({
    restaurant_id: "x",
    tier: "unknown",
    allergy_needs: ["gluten_free"],
    allergy_safety_note: "Menu says gluten-free options available",
  });
  assert.equal(d.curated, false);
  assert.equal(d.allergy_safety_note, undefined, "an uncurated note must not surface");
  assert.equal(d.allergy_needs, undefined, "uncurated needs must not surface");
  assert.match(d.advisory ?? "", /verify with the restaurant/i);
});

test("a stray / bogus tier is treated as unknown (whitelist, not raw DB value)", () => {
  for (const tier of ["bogus", "", null, undefined, "curated"]) {
    const att = buildSafetyAttestation(
      { restaurant_id: "x", tier: tier as string | null, as_of: "2026-07-01" },
      { signingKey: testKey() },
    );
    assert.equal(att.safety_tier, "unknown", `tier ${JSON.stringify(tier)} must collapse to unknown`);
    assert.equal(att.attestation, undefined, `tier ${JSON.stringify(tier)} must not be signed`);
  }
});

// --- Curated tiers: signed, and the signature actually verifies ---

test("attestation signs ONLY for a curated tier and the signature round-trips", () => {
  const key = testKey();
  for (const tier of CURATED_TIERS) {
    const att = buildSafetyAttestation(
      { restaurant_id: "abc", tier, as_of: "2026-07-01" },
      { signingKey: key },
    );
    assert.equal(att.safety_tier, tier);
    assert.equal(att.curated, true);
    assert.equal(att.signing_status, "signed");
    assert.ok(att.attestation, "curated tier must carry an attestation");
    assert.equal(att.attestation?.scheme, SAFETY_ATTESTATION_SCHEME);

    // The canonical string the agent reconstructs must reproduce the hash...
    const expected = canonicalizeSafetyClaim({
      restaurant_id: "abc",
      tier,
      as_of: "2026-07-01",
      key_fingerprint: att.attestation!.key_fingerprint,
    });
    assert.equal(att.attestation?.canonical, expected);

    // ...and the signature must verify against the real public key.
    assert.ok(
      verifyMenuSignature(att.attestation!.hash, att.attestation!.signature, key.publicKeyPem),
      `signature for tier ${tier} must verify against the public key`,
    );
  }
});

test("curated tier with NO signing key is explicit, not silently signed", () => {
  const att = buildSafetyAttestation(
    { restaurant_id: "abc", tier: "dedicated", as_of: "2026-07-01" },
    { signingKey: null },
  );
  assert.equal(att.safety_tier, "dedicated");
  assert.equal(att.attestation, undefined, "no key -> no signature");
  assert.equal(att.signing_status, "unsigned_no_key", "must say so plainly, not imply a signature");
});

// --- The pure disclosure gate (Wave 2·B spine) ---

test("disclosure surfaces the explicit unknown advisory for an uncurated place", () => {
  const d = buildSafetyDisclosure({
    restaurant_id: "x",
    tier: "unknown",
    allergy_needs: ["gluten_free"], // even if the row carries a stray tag
    allergy_safety_note: "some scraped note",
  });
  assert.equal(d.curated, false);
  assert.equal(d.safety_tier, "unknown");
  assert.equal(d.allergy_needs, undefined, "an unknown place must not surface needs");
  assert.equal(d.allergy_safety_note, undefined, "an unknown place must not surface a note");
  assert.match(d.advisory ?? "", /verify with the restaurant/i);
});

// --- Signed `as_of` must be stable ISO 8601, never a locale Date.toString() ---
// Regression: the Neon driver returns timestamp columns as Date objects; a raw
// Date stringified into the SIGNED canonical is not verifier-reproducible.

test("toIsoAsOf normalizes a Date object to ISO 8601 UTC", () => {
  const iso = toIsoAsOf(new Date("2026-07-17T16:09:50.000Z"));
  assert.equal(iso, "2026-07-17T16:09:50.000Z");
  assert.doesNotMatch(iso ?? "", /GMT|Coordinated Universal Time/, "must not be a Date.toString()");
});

test("toIsoAsOf passes through an ISO string and nulls the empty/unparseable", () => {
  assert.equal(toIsoAsOf("2026-07-17T16:09:50.000Z"), "2026-07-17T16:09:50.000Z");
  assert.equal(toIsoAsOf(null), null);
  assert.equal(toIsoAsOf(undefined), null);
  assert.equal(toIsoAsOf("not a date"), null);
});

// NEGATIVE CONTROL (manual): temporarily invert the gate in attestation.ts
// (e.g. `if (disclosure.curated) return disclosure;` -> drop the `!`, so an
// UNKNOWN place gets signed). The first test above MUST then fail. Watch it
// fail, then revert. A guard you have not watched fail is not a guard.
