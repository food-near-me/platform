#!/usr/bin/env node
/**
 * Verify RLS hardening using the public anon key.
 *
 * Asserts:
 *   - anon can SELECT from restaurants/menus/menu_categories/menu_items
 *   - anon CANNOT INSERT into restaurants
 *   - anon CANNOT INSERT into audit_leads, claim_verification_tokens, mcp_invocations
 *   - anon SELECT against the PII tables returns no rows (RLS or revoked grant)
 *
 * Usage: npm run db:verify:rls
 *
 * Exits 0 on all-pass, 1 on any failure.
 */

import { createClient } from "@supabase/supabase-js";
import { loadProjectEnv } from "./lib/supabase-db.mjs";

loadProjectEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  const icon = status === "pass" ? "[PASS]" : status === "fail" ? "[FAIL]" : "[SKIP]";
  console.log(`  ${icon} ${name}${detail ? " — " + detail : ""}`);
}

async function expectSelectWorks(table) {
  const { error } = await supabase.from(table).select("id").limit(1);
  if (error) {
    record(`anon SELECT ${table}`, "fail", error.message);
    return;
  }
  record(`anon SELECT ${table}`, "pass");
}

async function expectInsertBlocked(table, payload, expectedMatch = /row-level security|permission denied/i) {
  const { error } = await supabase.from(table).insert(payload);
  if (!error) {
    record(`anon INSERT ${table} blocked`, "fail", "insert succeeded — RLS is OFF or policy permits writes");
    return;
  }
  if (!expectedMatch.test(error.message)) {
    record(`anon INSERT ${table} blocked`, "fail", `unexpected error: ${error.message}`);
    return;
  }
  record(`anon INSERT ${table} blocked`, "pass", error.message.slice(0, 80));
}

async function expectSelectEmpty(table) {
  const { data, error } = await supabase.from(table).select("*").limit(1);
  if (error) {
    record(`anon SELECT ${table} returns empty`, "pass", error.message.slice(0, 80));
    return;
  }
  if (!data || data.length === 0) {
    record(`anon SELECT ${table} returns empty`, "pass", "0 rows visible to anon");
    return;
  }
  record(
    `anon SELECT ${table} returns empty`,
    "fail",
    `${data.length} row(s) visible to anon — RLS is OFF or policy is too permissive`,
  );
}

console.log("Verifying RLS via anon key…\n");
console.log("Public reads (should succeed):");
await expectSelectWorks("restaurants");
await expectSelectWorks("menus");
await expectSelectWorks("menu_categories");
await expectSelectWorks("menu_items");

console.log("\nPublic writes (should be blocked):");
await expectInsertBlocked("restaurants", {
  name: "rls-probe-restaurant",
  slug: `rls-probe-${Date.now()}`,
  location: "POINT(0 0)",
  verification_status: "discovered",
});

console.log("\nPII / write-only tables (should return empty + reject inserts):");
await expectSelectEmpty("audit_leads");
await expectSelectEmpty("claim_verification_tokens");
await expectSelectEmpty("mcp_invocations");

await expectInsertBlocked("audit_leads", {
  restaurant_name: "rls-probe",
  city: "rls-probe",
  email: "rls-probe@example.com",
  source: "rls-probe",
});
await expectInsertBlocked("claim_verification_tokens", {
  restaurant_id: "00000000-0000-0000-0000-000000000000",
  email: "rls-probe@example.com",
  token_hash: "rls-probe-hash",
  expires_at: new Date(Date.now() + 60_000).toISOString(),
});
await expectInsertBlocked("mcp_invocations", {
  tool_name: "rls-probe",
  status: "success",
  duration_ms: 0,
});

const failed = results.filter((r) => r.status === "fail");
const passed = results.filter((r) => r.status === "pass");
console.log(`\n${passed.length}/${results.length} checks passed.`);

if (failed.length > 0) {
  console.error(`${failed.length} check(s) failed — RLS hardening is NOT correctly applied.`);
  process.exit(1);
}

console.log("RLS hardening verified.");
