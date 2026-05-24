import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyMenuProtocolIssues,
  isLenientFatalIssue,
  validateMenuProtocolPayload,
  type MenuProtocolIssue,
} from "./validate";

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

function issue(path: string): MenuProtocolIssue {
  return { path, message: "test", code: "invalid_type" };
}

test("isLenientFatalIssue flags structural-core paths", () => {
  const fatalPaths = [
    "version",
    "restaurant",
    "restaurant.id",
    "restaurant.name",
    "restaurant.@type",
    "menu",
    "menu.id",
    "menu.restaurant_id",
    "menu.categories",
    "menu.items",
    "menu.items.0.name",
    "menu.items.5.name",
    "menu.items.999.name",
  ];
  for (const path of fatalPaths) {
    assert.equal(
      isLenientFatalIssue(issue(path)),
      true,
      `expected ${path} to be lenient-fatal`,
    );
  }
});

test("isLenientFatalIssue does NOT flag schema-strict-only paths", () => {
  const notFatalPaths = [
    "domain",
    "restaurant.slug",
    "restaurant.@context",
    "restaurant.address",
    "restaurant.geo",
    "restaurant.payment_methods",
    "menu.last_updated",
    "menu.language",
    "menu.currency",
    "menu.categories.0.id",
    "menu.categories.0.name",
    "menu.items.0.id",
    "menu.items.0.@type",
    "menu.items.0.category_id",
    "menu.items.0.dietary",
    "menu.items.0.dietary.vegan",
    "menu.items.0.allergens",
    "menu.items.0.customization_options",
    "menu.items.0.images",
    // Edge cases that look item-name-ish but aren't:
    "menu.items.0.name_alt",
    "menu.items.0.nameless",
    "menu.items",
  ];
  for (const path of notFatalPaths) {
    if (path === "menu.items") continue; // exact-match path IS fatal; covered above
    assert.equal(
      isLenientFatalIssue(issue(path)),
      false,
      `expected ${path} to NOT be lenient-fatal`,
    );
  }
});

test("classifyMenuProtocolIssues splits cleanly into the two buckets", () => {
  const issues: MenuProtocolIssue[] = [
    issue("version"),
    issue("domain"),
    issue("restaurant.id"),
    issue("restaurant.slug"),
    issue("menu.items.0.name"),
    issue("menu.items.0.@type"),
    issue("menu.items.3.dietary"),
  ];
  const { lenientFatal, schemaStrictOnly } = classifyMenuProtocolIssues(issues);

  const fatalPaths = lenientFatal.map((i) => i.path).sort();
  const strictPaths = schemaStrictOnly.map((i) => i.path).sort();

  assert.deepEqual(fatalPaths, [
    "menu.items.0.name",
    "restaurant.id",
    "version",
  ]);
  assert.deepEqual(strictPaths, [
    "domain",
    "menu.items.0.@type",
    "menu.items.3.dietary",
    "restaurant.slug",
  ]);
});
