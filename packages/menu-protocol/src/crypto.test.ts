import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fingerprintPublicKey,
  generateSigningKeyPair,
  hashMenuPayload,
  loadSigningKeyFromEnv,
  signMenuHash,
  verifyMenuSignature,
} from "./crypto";

const SAMPLE_PAYLOAD = {
  version: "1.0" as const,
  domain: "foodnear.me" as const,
  restaurant: {
    "@type": "Restaurant" as const,
    id: "r-1",
    slug: "test",
    name: "Test Cafe",
    payment_methods: [],
    dietary_certifications: [],
  },
  menu: {
    id: "m-1",
    restaurant_id: "r-1",
    last_updated: "2026-05-23T00:00:00.000Z",
    language: "en",
    currency: "USD",
    categories: [
      { id: "c-1", name: "Plates", sort_order: 0 },
    ],
    items: [
      {
        "@type": "MenuItem" as const,
        id: "i-1",
        category_id: "c-1",
        name: "Salad",
        available: true,
        dietary: {
          vegetarian: true,
          vegan: true,
          gluten_free: true,
          nut_free: true,
          dairy_free: true,
          low_carb: false,
          keto: false,
          halal: false,
          kosher: false,
        },
        allergens: [],
        customization_options: [],
        images: [],
      },
    ],
  },
};

test("hashMenuPayload is deterministic across key orderings", () => {
  const a = hashMenuPayload(SAMPLE_PAYLOAD);
  const reorderedRestaurant = {
    ...SAMPLE_PAYLOAD,
    restaurant: {
      slug: "test",
      name: "Test Cafe",
      id: "r-1",
      "@type": "Restaurant" as const,
      dietary_certifications: [],
      payment_methods: [],
    },
  };
  const b = hashMenuPayload(reorderedRestaurant);
  assert.equal(a, b, "hash must be invariant under key order");
});

test("generateSigningKeyPair returns valid PEM blocks", () => {
  const pair = generateSigningKeyPair();
  assert.match(pair.privateKeyPem, /BEGIN PRIVATE KEY/);
  assert.match(pair.publicKeyPem, /BEGIN PUBLIC KEY/);
  assert.match(pair.publicKeyFingerprint, /^[0-9a-f]{64}$/);
});

test("signMenuHash + verifyMenuSignature round-trip succeeds", () => {
  const pair = generateSigningKeyPair();
  const hash = hashMenuPayload(SAMPLE_PAYLOAD);
  const signature = signMenuHash(hash, pair.privateKeyPem);
  assert.equal(typeof signature, "string");
  assert.ok(signature.length > 0);
  assert.equal(verifyMenuSignature(hash, signature, pair.publicKeyPem), true);
});

test("verifyMenuSignature rejects a tampered hash", () => {
  const pair = generateSigningKeyPair();
  const hash = hashMenuPayload(SAMPLE_PAYLOAD);
  const signature = signMenuHash(hash, pair.privateKeyPem);
  const tampered = "00" + hash.slice(2);
  assert.equal(verifyMenuSignature(tampered, signature, pair.publicKeyPem), false);
});

test("verifyMenuSignature rejects signature from a different key", () => {
  const pairA = generateSigningKeyPair();
  const pairB = generateSigningKeyPair();
  const hash = hashMenuPayload(SAMPLE_PAYLOAD);
  const signature = signMenuHash(hash, pairA.privateKeyPem);
  assert.equal(verifyMenuSignature(hash, signature, pairB.publicKeyPem), false);
});

test("signMenuHash refuses placeholder/invalid private keys", () => {
  assert.throws(() => signMenuHash("deadbeef", "PLACEHOLDER_KEY"));
  assert.throws(() => signMenuHash("deadbeef", ""));
});

test("loadSigningKeyFromEnv returns null when env vars are missing", () => {
  const prior = {
    priv: process.env.FNM_VERIFIED_SIGNING_KEY,
    pub: process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY,
  };
  delete process.env.FNM_VERIFIED_SIGNING_KEY;
  delete process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY;
  try {
    assert.equal(loadSigningKeyFromEnv(), null);
  } finally {
    if (prior.priv !== undefined) process.env.FNM_VERIFIED_SIGNING_KEY = prior.priv;
    if (prior.pub !== undefined) process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY = prior.pub;
  }
});

test("loadSigningKeyFromEnv accepts bare base64 bodies and wraps them in PEM headers", () => {
  const pair = generateSigningKeyPair();
  const stripBody = (pem: string, kind: "PRIVATE" | "PUBLIC") =>
    pem
      .replace(`-----BEGIN ${kind} KEY-----`, "")
      .replace(`-----END ${kind} KEY-----`, "")
      .replace(/\s+/g, "");

  const prior = {
    priv: process.env.FNM_VERIFIED_SIGNING_KEY,
    pub: process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY,
  };
  process.env.FNM_VERIFIED_SIGNING_KEY = stripBody(pair.privateKeyPem, "PRIVATE");
  process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY = stripBody(pair.publicKeyPem, "PUBLIC");

  try {
    const loaded = loadSigningKeyFromEnv();
    assert.ok(loaded);
    const hash = hashMenuPayload(SAMPLE_PAYLOAD);
    const sig = signMenuHash(hash, loaded.privateKeyPem);
    assert.equal(verifyMenuSignature(hash, sig, loaded.publicKeyPem), true);
    assert.equal(loaded.publicKeyFingerprint, fingerprintPublicKey(pair.publicKeyPem));
  } finally {
    if (prior.priv === undefined) delete process.env.FNM_VERIFIED_SIGNING_KEY;
    else process.env.FNM_VERIFIED_SIGNING_KEY = prior.priv;
    if (prior.pub === undefined) delete process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY;
    else process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY = prior.pub;
  }
});

test("loadSigningKeyFromEnv accepts escaped-newline single-line PEMs", () => {
  const pair = generateSigningKeyPair();
  const prior = {
    priv: process.env.FNM_VERIFIED_SIGNING_KEY,
    pub: process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY,
  };
  process.env.FNM_VERIFIED_SIGNING_KEY = pair.privateKeyPem.replace(/\n/g, "\\n");
  process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY = pair.publicKeyPem.replace(/\n/g, "\\n");

  try {
    const loaded = loadSigningKeyFromEnv();
    assert.ok(loaded);
    const hash = hashMenuPayload(SAMPLE_PAYLOAD);
    const sig = signMenuHash(hash, loaded.privateKeyPem);
    assert.equal(verifyMenuSignature(hash, sig, loaded.publicKeyPem), true);
    assert.equal(loaded.publicKeyFingerprint, fingerprintPublicKey(pair.publicKeyPem));
  } finally {
    if (prior.priv === undefined) delete process.env.FNM_VERIFIED_SIGNING_KEY;
    else process.env.FNM_VERIFIED_SIGNING_KEY = prior.priv;
    if (prior.pub === undefined) delete process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY;
    else process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY = prior.pub;
  }
});
