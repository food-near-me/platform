import assert from "node:assert/strict";
import { test } from "node:test";

import { isAllowedRevalidatePath, parseBearer } from "./revalidate-guard";

// C7 — the internal purge route must be an allowlist, never an arbitrary-path
// oracle. These lock the allowed shapes and, more importantly, the refused ones.
test("allows real place + hood paths", () => {
  assert.equal(isAllowedRevalidatePath("/place/foo-dog-jax-allergy"), true);
  assert.equal(isAllowedRevalidatePath("/near-me/miami/brickell"), true);
});

test("refuses anything outside the place/hood allowlist", () => {
  for (const bad of [
    "/", // root
    "/admin", // unrelated route
    "/ops/curator-queue", // ops surface
    "/api/internal/revalidate", // the route itself
    "/place/", // prefix with no segment
    "/near-me/", // prefix with no segment
    "place/foo", // not absolute
    "//evil.com", // protocol-relative
    "/place/../admin", // traversal
    "/near-me/..%2f", // traversal-ish
    "/place/foo\nbar", // control char
    "", // empty
  ]) {
    assert.equal(
      isAllowedRevalidatePath(bad),
      false,
      `must refuse to revalidate ${JSON.stringify(bad)}`,
    );
  }
});

test("refuses non-string input", () => {
  for (const bad of [null, undefined, 42, {}, ["/place/x"]]) {
    assert.equal(isAllowedRevalidatePath(bad), false);
  }
});

test("parseBearer extracts only a well-formed Bearer token", () => {
  assert.equal(parseBearer("Bearer abc123"), "abc123");
  assert.equal(parseBearer("Bearer  spaced "), "spaced");
  assert.equal(parseBearer("bearer abc"), null); // scheme is case-sensitive here
  assert.equal(parseBearer("Basic abc"), null);
  assert.equal(parseBearer("abc"), null);
  assert.equal(parseBearer("Bearer "), null);
  assert.equal(parseBearer(null), null);
  assert.equal(parseBearer(undefined), null);
});
