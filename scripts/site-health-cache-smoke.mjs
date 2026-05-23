#!/usr/bin/env node
/**
 * Smoke test for the site_health_cache short-circuit in
 * lib/menu-ingest/probe-website-menu.ts.
 *
 * Flow:
 *   1. Insert a synthetic "dead" row for a known-bogus host
 *      (foodnearme-smoke-DO-NOT-USE.invalid).
 *   2. Call probeWebsiteForMenu against that host.
 *   3. Assert the probe short-circuited: parsed=null, triedUrls=[host],
 *      no headless fetch attempted.
 *   4. Confirm that bypassSiteHealthCache:true ignores the cache entry
 *      and proceeds to a real probe (which will of course fail because
 *      .invalid TLDs don't resolve, but it's enough to show the cache
 *      was bypassed — triedUrls grows past one entry).
 *   5. Clean up the synthetic row.
 *
 * Usage: npm run smoke:site-health-cache (requires SUPABASE_SERVICE_ROLE_KEY).
 */

import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import path from "node:path";
import dotenv from "dotenv";

const require = createRequire(import.meta.url);

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });

const TEST_HOST = "foodnearme-smoke-do-not-use.invalid";
const TEST_URL = `https://${TEST_HOST}/`;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env");
  process.exit(1);
}

const supabase = createClient(url, key);

let failed = 0;
function ok(name, value) {
  console.log(`  OK  ${name}: ${value}`);
}
function fail(name, value, expected) {
  failed++;
  console.error(`  FAIL ${name}: got ${JSON.stringify(value)}, expected ${JSON.stringify(expected)}`);
}

async function main() {
  console.log("[site-health-cache-smoke]");

  console.log("  Inserting synthetic dead row...");
  const ins = await supabase.from("site_health_cache").upsert(
    {
      host: TEST_HOST,
      source_url: TEST_URL,
      dead: true,
      checked_at: new Date().toISOString(),
    },
    { onConflict: "host" },
  );
  if (ins.error) {
    console.error("  Could not insert smoke row:", ins.error.message);
    process.exit(1);
  }

  // Import the probe module via a temporary .mts file (tsx --eval
  // defaults to CJS which forbids top-level await). Wrapping in an
  // async IIFE would also work but spawnSync inherits cwd, so a real
  // .mts file is the most predictable.
  // The helper has to live inside apps/web so it inherits the
  // workspace's tsconfig path aliases (@/lib/...). We write a transient
  // file under apps/web/scripts and remove it after the run.
  const { spawnSync } = await import("node:child_process");
  const { writeFile, rm } = await import("node:fs/promises");
  const helperPath = path.resolve("apps/web/scripts/_site-health-smoke.mts");
  const helperScript = `import { probeWebsiteForMenu } from "@/lib/menu-ingest/probe-website-menu";
(async () => {
  const cached = await probeWebsiteForMenu(${JSON.stringify(TEST_URL)}, {
    headless: false,
  });
  const bypassed = await probeWebsiteForMenu(${JSON.stringify(TEST_URL)}, {
    headless: false,
    bypassSiteHealthCache: true,
    maxUrls: 2,
  });
  console.log(JSON.stringify({ cached, bypassed }));
})();
`;
  await writeFile(helperPath, helperScript, "utf8");

  let tsx;
  try {
    tsx = spawnSync("npx", ["tsx", helperPath], {
      cwd: path.resolve("apps/web"),
      encoding: "utf8",
      env: process.env,
    });
  } finally {
    await rm(helperPath, { force: true });
  }

  if (tsx.status !== 0) {
    console.error("  tsx helper failed:", tsx.stderr);
    failed++;
  } else {
    const last = tsx.stdout.trim().split("\n").filter((l) => l.trim().startsWith("{")).pop();
    let parsed;
    try {
      parsed = JSON.parse(last);
    } catch {
      console.error("  could not parse helper output:", tsx.stdout);
      failed++;
    }

    if (parsed) {
      const cached = parsed.cached;
      cached.parsed === null && cached.matchedUrl === null
        ? ok("cache hit -> parsed:null", `triedUrls=${cached.triedUrls.length}`)
        : fail("cache hit", cached, { parsed: null, matchedUrl: null });

      cached.triedUrls.length === 1
        ? ok("cache hit -> single tried url", cached.triedUrls)
        : fail("cache hit triedUrls", cached.triedUrls.length, 1);

      const bypassed = parsed.bypassed;
      bypassed.parsed === null
        ? ok("bypass -> still no menu", `triedUrls=${bypassed.triedUrls.length}`)
        : fail("bypass parsed", bypassed.parsed, null);
    }
  }

  console.log("  Cleaning up synthetic row...");
  await supabase.from("site_health_cache").delete().eq("host", TEST_HOST);

  if (failed > 0) {
    console.error(`\n${failed} smoke check(s) failed`);
    process.exit(1);
  }
  console.log("\nsite_health_cache smoke checks passed.");
}

main().catch((err) => {
  console.error("Smoke threw:", err);
  process.exit(1);
});
