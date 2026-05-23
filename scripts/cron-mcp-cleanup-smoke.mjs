#!/usr/bin/env node
/**
 * Smoke test for /api/cron/cleanup-mcp-invocations against a running server.
 *
 * Usage:
 *   CRON_SECRET=local-test-secret node scripts/cron-mcp-cleanup-smoke.mjs
 *
 * Optional:
 *   BASE_URL=http://localhost:3100 (default)
 *
 * Asserts:
 *   1. Missing secret -> 401.
 *   2. Wrong secret   -> 401.
 *   3. Correct secret -> 200 with { ok: true, deleted: <number>, retention_days: 90 }.
 *
 * Safe to run repeatedly: cleanup_old_mcp_invocations(90) is idempotent —
 * the second invocation just reports zero deletions.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
const SECRET = process.env.CRON_SECRET ?? "local-test-secret";
const PATH = "/api/cron/cleanup-mcp-invocations";

let failed = 0;
function ok(name, value) {
  console.log(`  OK  ${name}: ${value}`);
}
function fail(name, value, expected) {
  failed++;
  console.error(`  FAIL ${name}: got ${JSON.stringify(value)}, expected ${JSON.stringify(expected)}`);
}

async function hit(headers) {
  const res = await fetch(`${BASE_URL}${PATH}`, { method: "POST", headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { status: res.status, body };
}

console.log(`[cron-mcp-cleanup-smoke] base=${BASE_URL} path=${PATH}`);

try {
  const noAuth = await hit({});
  noAuth.status === 401
    ? ok("missing auth -> 401", noAuth.status)
    : fail("missing auth", noAuth.status, 401);

  const wrongAuth = await hit({ authorization: "Bearer not-the-secret" });
  wrongAuth.status === 401
    ? ok("wrong secret -> 401", wrongAuth.status)
    : fail("wrong secret", wrongAuth.status, 401);

  const good = await hit({ authorization: `Bearer ${SECRET}` });
  if (good.status === 200 && good.body?.ok === true && good.body?.retention_days === 90) {
    ok(
      "valid secret -> 200",
      `deleted=${good.body.deleted}, retention_days=${good.body.retention_days}`,
    );
  } else {
    fail("valid secret", good, {
      status: 200,
      body: { ok: true, retention_days: 90 },
    });
  }
} catch (err) {
  console.error("Smoke test threw:", err);
  failed++;
}

if (failed > 0) {
  console.error(`\n${failed} smoke check(s) failed`);
  process.exit(1);
}
console.log("\nAll mcp cleanup cron smoke checks passed.");
