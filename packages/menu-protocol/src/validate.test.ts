import assert from "node:assert/strict";
import { test } from "node:test";

import { validateMenuProtocolPayload } from "./validate";

const VALID_PAYLOAD = {
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
    categories: [{ id: "c-1", name: "Plates", sort_order: 0 }],
    items: [
      {
        "@type": "MenuItem" as const,
        id: "i-1",
        category_id: "c-1",
        name: "Salad",
        available: true,
        dietary: {
          vegetarian: true,
          vegan: false,
          gluten_free: false,
          nut_free: false,
          dairy_free: false,
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

test("validateMenuProtocolPayload accepts a canonical valid payload", () => {
  const result = validateMenuProtocolPayload(VALID_PAYLOAD);
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});

test("validateMenuProtocolPayload rejects non-object input", () => {
  for (const value of [null, undefined, "string", 42, true, [1, 2, 3]]) {
    const result = validateMenuProtocolPayload(value);
    if (Array.isArray(value)) {
      // Arrays are objects in JS so Zod walks them; behavior is checked elsewhere.
      assert.equal(result.valid, false);
      continue;
    }
    assert.equal(result.valid, false, `expected ${typeof value} to be invalid`);
    assert.equal(result.issues[0]?.path, "(root)");
    assert.equal(result.issues[0]?.code, "invalid_type");
  }
});

test("validateMenuProtocolPayload reports invalid version", () => {
  const payload = { ...VALID_PAYLOAD, version: "2.0" };
  const result = validateMenuProtocolPayload(payload);
  assert.equal(result.valid, false);
  const versionIssue = result.issues.find((i) => i.path === "version");
  assert.ok(versionIssue, "expected version issue");
  assert.equal(versionIssue.code, "invalid_literal");
});

test("validateMenuProtocolPayload reports missing required restaurant fields", () => {
  const payload = {
    ...VALID_PAYLOAD,
    restaurant: { "@type": "Restaurant" as const },
  };
  const result = validateMenuProtocolPayload(payload);
  assert.equal(result.valid, false);
  const paths = result.issues.map((i) => i.path);
  assert.ok(paths.includes("restaurant.name"), `expected restaurant.name issue, got: ${paths.join(", ")}`);
  assert.ok(paths.includes("restaurant.id"), `expected restaurant.id issue, got: ${paths.join(", ")}`);
  assert.ok(paths.includes("restaurant.slug"), `expected restaurant.slug issue, got: ${paths.join(", ")}`);
});

test("validateMenuProtocolPayload reports wrong-type menu", () => {
  const payload = {
    ...VALID_PAYLOAD,
    menu: "not-an-object",
  };
  const result = validateMenuProtocolPayload(payload);
  assert.equal(result.valid, false);
  const menuIssue = result.issues.find((i) => i.path === "menu");
  assert.ok(menuIssue, "expected menu issue");
  assert.equal(menuIssue.code, "invalid_type");
});

test("validateMenuProtocolPayload surfaces per-item issues with indexed paths", () => {
  const payload = {
    ...VALID_PAYLOAD,
    menu: {
      ...VALID_PAYLOAD.menu,
      items: [
        VALID_PAYLOAD.menu.items[0],
        { id: "broken" }, // missing every other required field
      ],
    },
  };
  const result = validateMenuProtocolPayload(payload);
  assert.equal(result.valid, false);
  const indexedPaths = result.issues
    .map((i) => i.path)
    .filter((p) => p.startsWith("menu.items.1."));
  assert.ok(
    indexedPaths.length > 0,
    `expected indexed item issues, got: ${result.issues.map((i) => i.path).join(", ")}`,
  );
});
