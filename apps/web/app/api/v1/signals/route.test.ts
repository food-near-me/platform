import assert from "node:assert/strict";
import { test } from "node:test";

import { handleSignal, type SignalHandlerDeps } from "./route";
import type { RecordCuratorSignalResult } from "@/lib/curator-signals";

/**
 * Route tests for /api/v1/signals via the injectable `handleSignal` seam, so NO
 * test touches live Neon (tsx runs tests as CJS, where node:test mock.module is
 * unavailable). We assert the honesty-safe contract: a forced insert failure is
 * a non-200, a same-actor same-day repeat is an idempotent 200, and the body
 * NEVER echoes a tier/count/dedupe state.
 */

process.env.DATABASE_URL ??= "postgres://stub";

const RID = "11111111-1111-1111-1111-111111111111";

function req(body: unknown): Request {
  return new Request("http://localhost/api/v1/signals", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.5" },
    body: JSON.stringify(body),
  });
}

function deps(over: Partial<SignalHandlerDeps>): SignalHandlerDeps {
  return {
    restaurantExists: async () => true,
    record: async (): Promise<RecordCuratorSignalResult> => ({ ok: true, deduped: false }),
    ...over,
  };
}

test("route: rejects an unknown signal_type with 400", async () => {
  const res = await handleSignal(req({ restaurant_id: RID, signal_type: "spam" }), deps({}));
  assert.equal(res.status, 400);
});

test("route: 404 when the restaurant does not exist", async () => {
  const res = await handleSignal(
    req({ restaurant_id: RID, signal_type: "outdated" }),
    deps({ restaurantExists: async () => false }),
  );
  assert.equal(res.status, 404);
});

test("route: 500 on a forced insert failure, body echoes no tier/count", async () => {
  const res = await handleSignal(
    req({ restaurant_id: RID, signal_type: "outdated" }),
    deps({ record: async () => ({ ok: false, deduped: false }) }),
  );
  assert.equal(res.status, 500);
  const json = (await res.json()) as Record<string, unknown>;
  assert.equal("tier" in json, false);
  assert.equal("count" in json, false);
});

test("route: a duplicate (same actor/day) is an idempotent 200; body carries no tier/count", async () => {
  const res = await handleSignal(
    req({ restaurant_id: RID, signal_type: "confirm" }),
    deps({ record: async () => ({ ok: true, deduped: true }) }),
  );
  assert.equal(res.status, 200);
  const json = (await res.json()) as Record<string, unknown>;
  assert.equal(json.ok, true);
  assert.equal("tier" in json, false);
  assert.equal("count" in json, false);
  assert.equal("deduped" in json, false); // the response never leaks dedupe state either
});
