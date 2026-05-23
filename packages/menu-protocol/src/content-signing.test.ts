import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MENU_SIGNATURE_FORMAT_V1,
  buildCanonicalMenuContent,
  computeMenuPayloadHash,
  generateSigningKeyPair,
  signMenuContent,
  verifyMenuContentSignature,
} from "./crypto";

const RESTAURANT_ID = "11111111-1111-1111-1111-111111111111";
const MENU_ID = "22222222-2222-2222-2222-222222222222";
const SIGNER = "owner@example.com|fnm-server:abcdef1234567890";
const TIMESTAMP = "2026-05-23T12:00:00.000Z";

function sampleInput() {
  return {
    protocol_version: "1.0",
    categories: [
      { id: "cat-a", name: "Appetizers" },
      { id: "cat-b", name: "Mains" },
    ],
    items: [
      {
        category_id: "cat-b",
        name: "Pad Thai",
        description: "Rice noodles with tamarind",
        price: 18.5,
        currency: "USD",
        available: true,
        preparation_time_minutes: 12,
        dietary_vegetarian: true,
        dietary_vegan: false,
        dietary_gluten_free: true,
        dietary_halal: false,
        dietary_kosher: false,
        dietary_nut_free: false,
        dietary_dairy_free: true,
        dietary_low_carb: false,
        dietary_keto: false,
        allergens: ["peanuts", "soy"],
      },
      {
        category_id: "cat-a",
        name: "Spring Rolls",
        description: null,
        price: 7,
        currency: "USD",
        available: true,
        preparation_time_minutes: 5,
        dietary_vegetarian: true,
        dietary_vegan: true,
        dietary_gluten_free: false,
        dietary_halal: false,
        dietary_kosher: false,
        dietary_nut_free: true,
        dietary_dairy_free: true,
        dietary_low_carb: false,
        dietary_keto: false,
        allergens: ["soy", "wheat"],
      },
    ],
  };
}

test("buildCanonicalMenuContent sorts items deterministically and sorts allergen arrays", () => {
  const input = sampleInput();
  const result = buildCanonicalMenuContent(input);
  assert.equal(result.protocol_version, "1.0");
  assert.equal(result.items.length, 2);
  // Appetizers come before Mains because we sort by category_name ascending.
  assert.equal(result.items[0]!.category_name, "Appetizers");
  assert.equal(result.items[0]!.name, "Spring Rolls");
  assert.equal(result.items[1]!.category_name, "Mains");
  // Allergens are sorted alphabetically inside the canonical form.
  assert.deepEqual(result.items[0]!.allergens, ["soy", "wheat"]);
  assert.deepEqual(result.items[1]!.allergens, ["peanuts", "soy"]);
});

test("computeMenuPayloadHash is stable across reordering of input rows", () => {
  const base = sampleInput();
  const reordered = {
    ...base,
    categories: [...base.categories].reverse(),
    items: [...base.items].reverse(),
  };
  const reorderedAllergens = {
    ...base,
    items: base.items.map((it) => ({ ...it, allergens: [...(it.allergens ?? [])].reverse() })),
  };
  const hashA = computeMenuPayloadHash(buildCanonicalMenuContent(base));
  const hashB = computeMenuPayloadHash(buildCanonicalMenuContent(reordered));
  const hashC = computeMenuPayloadHash(buildCanonicalMenuContent(reorderedAllergens));
  assert.equal(hashA, hashB);
  assert.equal(hashA, hashC);
});

test("computeMenuPayloadHash changes when item content is mutated", () => {
  const base = buildCanonicalMenuContent(sampleInput());
  const tampered = sampleInput();
  tampered.items[0]!.price = 99.99;
  const tamperedContent = buildCanonicalMenuContent(tampered);
  assert.notEqual(computeMenuPayloadHash(base), computeMenuPayloadHash(tamperedContent));
});

test("signMenuContent + verifyMenuContentSignature round-trip succeeds for unchanged content", () => {
  const { privateKeyPem, publicKeyPem } = generateSigningKeyPair();
  const content = buildCanonicalMenuContent(sampleInput());
  const { signature, payload_hash, signing_format } = signMenuContent({
    content,
    restaurantId: RESTAURANT_ID,
    menuId: MENU_ID,
    signer: SIGNER,
    timestamp: TIMESTAMP,
    privateKeyPem,
  });
  assert.equal(signing_format, MENU_SIGNATURE_FORMAT_V1);

  const result = verifyMenuContentSignature({
    content,
    restaurantId: RESTAURANT_ID,
    menuId: MENU_ID,
    signer: SIGNER,
    timestamp: TIMESTAMP,
    expectedPayloadHash: payload_hash,
    signature,
    publicKeyPem,
  });
  assert.equal(result.valid, true);
  assert.equal(result.computed_payload_hash, payload_hash);
});

test("verifyMenuContentSignature reports payload_hash_mismatch when contents are mutated", () => {
  const { privateKeyPem, publicKeyPem } = generateSigningKeyPair();
  const content = buildCanonicalMenuContent(sampleInput());
  const { signature, payload_hash } = signMenuContent({
    content,
    restaurantId: RESTAURANT_ID,
    menuId: MENU_ID,
    signer: SIGNER,
    timestamp: TIMESTAMP,
    privateKeyPem,
  });

  const tampered = sampleInput();
  tampered.items[0]!.price = 1.0;
  const tamperedContent = buildCanonicalMenuContent(tampered);

  const result = verifyMenuContentSignature({
    content: tamperedContent,
    restaurantId: RESTAURANT_ID,
    menuId: MENU_ID,
    signer: SIGNER,
    timestamp: TIMESTAMP,
    expectedPayloadHash: payload_hash,
    signature,
    publicKeyPem,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "payload_hash_mismatch");
});

test("verifyMenuContentSignature reports signature_invalid when the signing tuple is tampered", () => {
  const { privateKeyPem, publicKeyPem } = generateSigningKeyPair();
  const content = buildCanonicalMenuContent(sampleInput());
  const { signature, payload_hash } = signMenuContent({
    content,
    restaurantId: RESTAURANT_ID,
    menuId: MENU_ID,
    signer: SIGNER,
    timestamp: TIMESTAMP,
    privateKeyPem,
  });

  const result = verifyMenuContentSignature({
    content,
    restaurantId: RESTAURANT_ID,
    menuId: MENU_ID,
    signer: "different@example.com|fnm-server:000000000000",
    timestamp: TIMESTAMP,
    expectedPayloadHash: payload_hash,
    signature,
    publicKeyPem,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "signature_invalid");
});

test("verifyMenuContentSignature returns missing_public_key when caller omits the key", () => {
  const content = buildCanonicalMenuContent(sampleInput());
  const result = verifyMenuContentSignature({
    content,
    restaurantId: RESTAURANT_ID,
    menuId: MENU_ID,
    signer: SIGNER,
    timestamp: TIMESTAMP,
    expectedPayloadHash: "deadbeef",
    signature: "AAAA",
    publicKeyPem: "",
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "missing_public_key");
});
