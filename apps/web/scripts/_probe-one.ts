#!/usr/bin/env npx tsx
import { probeWebsiteForMenu } from "../lib/menu-ingest/probe-website-menu";
import { closePlaywrightBrowser } from "../lib/menu-ingest/fetch-website-playwright";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npx tsx scripts/_probe-one.ts <url>");
  process.exit(1);
}

async function main() {
  const r = await probeWebsiteForMenu(url, {
    headless: true,
    maxUrls: 18,
    preserveQueryOnDiscover: true,
    verbose: process.argv.includes("--verbose"),
  });
  const n = r.parsed?.categories.reduce((a, x) => a + x.items.length, 0) ?? 0;
  console.log({
    parser: r.parser,
    fetchVia: r.fetchVia,
    matchedUrl: r.matchedUrl,
    items: n,
    tried: r.triedUrls,
  });
  await closePlaywrightBrowser();
}

main();
