import assert from "node:assert/strict";
import { test } from "node:test";

import { OPS_DEFAULT_NEXT, safeOpsNext, isValidOpsToken } from "./ops-auth";

test("safeOpsNext allows same-origin /ops paths", () => {
  assert.equal(safeOpsNext("/ops/curator-queue"), "/ops/curator-queue");
  assert.equal(safeOpsNext("/ops/near-me"), "/ops/near-me");
});

test("safeOpsNext defeats open-redirect attempts", () => {
  for (const bad of [
    "https://evil.example/phish",
    "//evil.example",
    "/dashboard", // not under /ops
    "\\/evil",
    "/ops/x\r\nSet-Cookie: y", // CRLF injection
    "",
    undefined,
    null,
  ]) {
    assert.equal(
      safeOpsNext(bad as string | null | undefined),
      OPS_DEFAULT_NEXT,
      `"${String(bad)}" must fall back to the safe default`,
    );
  }
});

test("isValidOpsToken fails closed without a configured secret", () => {
  const prev = process.env.OPS_SECRET;
  delete process.env.OPS_SECRET;
  try {
    assert.equal(isValidOpsToken("anything"), false, "no secret configured -> never authed");
    assert.equal(isValidOpsToken(undefined), false);
  } finally {
    if (prev !== undefined) process.env.OPS_SECRET = prev;
  }
});
