import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  CURATOR_QUEUE_ORDER_BY,
  CURATOR_QUEUE_QUERY,
  loadCuratorQueue,
  stalenessLabel,
  daysSince,
  type CuratorQueueRow,
} from "./curator-queue";
import { isValidOpsToken, opsSessionToken } from "./ops-auth";

/**
 * C3 sentinels for the curator queue.
 *
 *  (a) The queue ORDER BY must be a TIME column (staleness), NEVER a signal
 *      count. Volume sorting would turn user clicks into a de-tiering lever —
 *      the exact "crowdsourced review" the honesty invariants forbid.
 *  (b) An unauthenticated caller (no valid ops cookie) must NEVER get the queue.
 */

const testDir = dirname(fileURLToPath(import.meta.url));

// ── (a) ordering is by time, not volume ───────────────────────────────────────

test("(a) queue ORDER BY sorts by a time column, not count(*)", () => {
  // The ORDER BY names last_checked_at (a timestamp), ascending (stalest first).
  assert.match(CURATOR_QUEUE_ORDER_BY, /last_checked_at/i);
  assert.match(CURATOR_QUEUE_ORDER_BY, /\basc\b/i);
  // It must NOT order by any aggregate/count of signals.
  assert.doesNotMatch(CURATOR_QUEUE_ORDER_BY, /count\s*\(/i);
  assert.doesNotMatch(CURATOR_QUEUE_ORDER_BY, /\border\s+by\s+n\b/i);
});

test("(a) the queue query never computes count(*) / GROUP BY over signals", () => {
  assert.doesNotMatch(CURATOR_QUEUE_QUERY, /count\s*\(/i);
  assert.doesNotMatch(CURATOR_QUEUE_QUERY, /\bgroup\s+by\b/i);
  // membership is by EXISTS, not an aggregated join
  assert.match(CURATOR_QUEUE_QUERY, /\bexists\b/i);
  // the ORDER BY in the actual query text is the time-column one
  assert.match(CURATOR_QUEUE_QUERY, /order\s+by\s+last_checked_at/i);
});

test("(a) the queue SOURCE FILE contains no count(*) sort over signals", () => {
  const src = readFileSync(resolve(testDir, "curator-queue.ts"), "utf8");
  // A regression that sorts by signal volume would introduce `count(` — bite it.
  assert.doesNotMatch(src, /order\s+by[^;]*count\s*\(/i);
});

test("(a) loadCuratorQueue preserves DB order (no in-code volume re-sort)", async () => {
  // The DB returns stalest-first (oldest last_checked_at). loadCuratorQueue must
  // hand that order straight through — never re-sort by anything.
  const dbOrder: CuratorQueueRow[] = [
    { restaurant_id: "a", name: "A", slug: "a", last_checked_at: "2026-01-01T00:00:00Z", campaign_flag: false },
    { restaurant_id: "b", name: "B", slug: "b", last_checked_at: "2026-06-01T00:00:00Z", campaign_flag: false },
  ];
  const sql = { query: async () => dbOrder } as unknown as Parameters<typeof loadCuratorQueue>[0];
  const rows = await loadCuratorQueue(sql);
  assert.deepEqual(
    rows.map((r) => r.restaurant_id),
    ["a", "b"],
  );
});

// ── (b) unauthenticated access is denied ──────────────────────────────────────

test("(b) an empty / wrong cookie is not a valid ops session", () => {
  process.env.OPS_SECRET = "s3cr3t-for-test";
  const good = opsSessionToken();
  assert.ok(good);
  assert.equal(isValidOpsToken(undefined), false);
  assert.equal(isValidOpsToken(""), false);
  assert.equal(isValidOpsToken("nope"), false);
  assert.equal(isValidOpsToken(good!), true);
});

test("(b) with OPS_SECRET unset, no cookie ever authorizes", () => {
  delete process.env.OPS_SECRET;
  assert.equal(opsSessionToken(), null);
  assert.equal(isValidOpsToken("anything"), false);
});

// ── copy: bare prompt-to-look, no count ───────────────────────────────────────

test("staleness label is a prompt-to-look with no count/aggregate", () => {
  const now = new Date("2026-07-18T00:00:00Z");
  assert.equal(daysSince("2026-07-08T00:00:00Z", now), 10);
  assert.equal(stalenessLabel("2026-07-08T00:00:00Z", now), "10 days since last curator check · go look");
  assert.equal(stalenessLabel(null, now), "never curator-checked · go look");
  // no digit-count-of-signals phrasing ever leaks
  assert.doesNotMatch(stalenessLabel("2026-07-08T00:00:00Z", now), /signal|report|vote/i);
});
