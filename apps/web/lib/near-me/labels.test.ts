import assert from "node:assert/strict";
import { test } from "node:test";

import { trustLabel } from "./labels";

// C8 — the owner-driven trust column must never present as a safety endorsement.
// 'verified'/'menu_indexed' are owner-submitted states; they collapse to a plain
// "menu on file (owner-submitted)" label and the bare word "verified" must never
// reach a consumer surface (where it could read as an allergy-safety guarantee).
test("owner statuses read as owner-submitted, never a bare 'verified'", () => {
  assert.equal(trustLabel("verified"), "menu on file (owner-submitted)");
  assert.equal(trustLabel("menu_indexed"), "menu on file (owner-submitted)");
  assert.equal(trustLabel("listed"), "listed");
  assert.equal(trustLabel("anything-else"), "listed");
});

test("trustLabel never emits an endorsement word", () => {
  for (const status of ["verified", "menu_indexed", "listed", "unknown"]) {
    const label = trustLabel(status);
    assert.doesNotMatch(
      label,
      /\bverified\b|\bcertified\b|\bsafe\b/i,
      `trustLabel("${status}") = "${label}" must not read as a safety endorsement`,
    );
  }
});
