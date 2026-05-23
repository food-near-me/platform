/**
 * Smoke test for the rate limiter.
 *
 * Runs the in-memory adapter through its public surface (window counters,
 * min-interval debounce, reset across windows) and asserts the unified
 * `checkRateLimit` / `checkMinInterval` API behaves consistently.
 *
 * Does NOT exercise Upstash (no credentials required); the adapter selection
 * is verified by toggling env vars and checking `rateLimitBackend()`.
 *
 * Usage: npm run test:rate-limit
 */

import {
  checkMinInterval,
  checkRateLimit,
  rateLimitBackend,
} from "../lib/rate-limit";
import { __resetInMemoryStoreForTests } from "../lib/rate-limit/in-memory";

type Result = { name: string; status: "pass" | "fail"; message?: string };
const results: Result[] = [];

function pass(name: string) {
  results.push({ name, status: "pass" });
  console.log(`  [PASS] ${name}`);
}
function fail(name: string, message: string) {
  results.push({ name, status: "fail", message });
  console.error(`  [FAIL] ${name} — ${message}`);
}

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    pass(name);
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  // Force in-memory mode for the suite.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  assert(rateLimitBackend() === "in-memory", "backend should be in-memory without Upstash env");

  await run("backend selector reports upstash when env present", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    assert(rateLimitBackend() === "upstash", "should report upstash with env vars");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    assert(rateLimitBackend() === "in-memory", "should revert to in-memory");
  });

  await run("in-memory window counter allows up to limit", async () => {
    __resetInMemoryStoreForTests();
    const key = `smoke:window:${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit({ key, limit: 3, windowMs: 60_000 });
      assert(r.allowed, `request ${i + 1} should be allowed`);
      assert(r.remaining === 3 - (i + 1), `remaining should decrement to ${3 - (i + 1)}, got ${r.remaining}`);
    }
    const blocked = await checkRateLimit({ key, limit: 3, windowMs: 60_000 });
    assert(!blocked.allowed, "4th request should be blocked");
    assert(blocked.remaining === 0, "blocked remaining should be 0");
  });

  await run("in-memory window counter resets after windowMs", async () => {
    __resetInMemoryStoreForTests();
    const key = `smoke:reset:${Math.random()}`;
    const first = await checkRateLimit({ key, limit: 1, windowMs: 50 });
    assert(first.allowed, "first hit allowed");
    const second = await checkRateLimit({ key, limit: 1, windowMs: 50 });
    assert(!second.allowed, "second hit blocked");
    await delay(70);
    const third = await checkRateLimit({ key, limit: 1, windowMs: 50 });
    assert(third.allowed, "third hit after window allowed");
  });

  await run("in-memory min-interval debounces back-to-back hits", async () => {
    __resetInMemoryStoreForTests();
    const key = `smoke:debounce:${Math.random()}`;
    const first = await checkMinInterval({ key, minIntervalMs: 50 });
    assert(first.allowed, "first call allowed");
    const second = await checkMinInterval({ key, minIntervalMs: 50 });
    assert(!second.allowed, "second call within interval blocked");
    await delay(70);
    const third = await checkMinInterval({ key, minIntervalMs: 50 });
    assert(third.allowed, "third call after interval allowed");
  });

  await run("upstash adapter fails open to in-memory on network error", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:1"; // guaranteed connection refused
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    process.env.UPSTASH_RATE_LIMIT_TIMEOUT_MS = "200";
    __resetInMemoryStoreForTests();
    const key = `smoke:fallback:${Math.random()}`;
    // Should not throw, should fall through to in-memory.
    const r = await checkRateLimit({ key, limit: 2, windowMs: 60_000 });
    assert(r.allowed, "first call should still be allowed under fallback");
    const r2 = await checkRateLimit({ key, limit: 2, windowMs: 60_000 });
    const r3 = await checkRateLimit({ key, limit: 2, windowMs: 60_000 });
    assert(r2.allowed && !r3.allowed, "fallback should still enforce limits per process");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_RATE_LIMIT_TIMEOUT_MS;
  });

  const failed = results.filter((r) => r.status === "fail").length;
  const passed = results.filter((r) => r.status === "pass").length;
  console.log(`\n${passed}/${results.length} rate-limit checks passed.`);
  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
