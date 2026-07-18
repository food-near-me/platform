import assert from "node:assert/strict";
import { test, mock } from "node:test";

import { recordCuratorSignal } from "./curator-signals";

/**
 * Unit tests for the curator-signals write path. These NEVER touch live Neon:
 * `recordCuratorSignal` takes an injectable executor, and the route test stubs
 * the Neon module. They assert the honesty-relevant behavior only — awaited
 * write, idempotent de-dupe, and a hard failure (not a swallowed warn) on a
 * broken insert.
 */

const input = {
  restaurantId: "11111111-1111-1111-1111-111111111111",
  signalType: "outdated" as const,
  actorHash: "deadbeef",
};

test("recordCuratorSignal: a real insert returns ok, not deduped", async () => {
  const exec = mock.fn(async () => [{ id: "row-1" }]);
  const res = await recordCuratorSignal(input, exec);
  assert.deepEqual(res, { ok: true, deduped: false });
  assert.equal(exec.mock.callCount(), 1);
  // The write is an INSERT ... ON CONFLICT DO NOTHING (de-dupe by the DB).
  const sqlText = String(exec.mock.calls.at(0)?.arguments.at(0) ?? "");
  assert.match(sqlText, /INSERT INTO curator_signals/i);
  assert.match(sqlText, /ON CONFLICT DO NOTHING/i);
});

test("recordCuratorSignal: a same-day conflict is an idempotent ok+deduped, not a second row", async () => {
  // ON CONFLICT DO NOTHING + RETURNING yields zero rows on a dupe.
  const exec = mock.fn(async () => []);
  const res = await recordCuratorSignal(input, exec);
  assert.deepEqual(res, { ok: true, deduped: true });
});

test("recordCuratorSignal: a non-conflict insert failure returns ok:false (a monitored error)", async () => {
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (line: unknown) => errors.push(line);
  try {
    const exec = mock.fn(async () => {
      throw new Error("connection reset");
    });
    const res = await recordCuratorSignal(input, exec);
    assert.deepEqual(res, { ok: false, deduped: false });
  } finally {
    console.error = original;
  }
  // Logged as a monitored error (log.error → console.error), never swallowed.
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /curator_signal\.write_failed/);
});
