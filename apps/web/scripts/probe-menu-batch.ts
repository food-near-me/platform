#!/usr/bin/env npx tsx
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "node:path";
import { probeWebsiteForMenu } from "../lib/menu-ingest/probe-website-menu";
import {
  gridCellRadiusMeters,
  gridSamplePoints,
  rankWebsiteCandidates,
} from "../lib/menu-ingest/website-candidates";
import { resolveRegion } from "./lib/load-import-regions";

import { closePlaywrightBrowser } from "../lib/menu-ingest/fetch-website-playwright";
import { summarizeDeliveryUrls } from "../lib/menu-ingest/delivery-platform-urls";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const headless = process.argv.includes("--headless");
const limit = Number.parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? "25",
  10,
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  try {
  const region = resolveRegion("williamsburg");
  const points = gridSamplePoints(region.bbox, 3);
  const radius = gridCellRadiusMeters(region.bbox, 3);
  const ids = new Set<string>();
  for (const p of points) {
    const { data } = await supabase.rpc("search_restaurants_for_agents", {
      search_query: "",
      lat: p.lat,
      lng: p.lng,
      radius_meters: radius,
      min_agent_score: 0,
      dietary_filters: [],
    });
    for (const r of data ?? []) {
      if (r.verification_status === "discovered") ids.add(r.id as string);
    }
  }

  const { data: rows } = await supabase
    .from("restaurants")
    .select("id,name,website_url")
    .in("id", [...ids])
    .eq("verification_status", "discovered")
    .not("website_url", "is", null);

  const candidates = rankWebsiteCandidates(rows ?? [], { includeChains: false }).slice(0, limit);
  let hit = 0;
  let miss = 0;

  const PROBE_TIMEOUT_MS = 90_000;

  for (const c of candidates) {
    const probePromise = probeWebsiteForMenu(c.website_url, {
      maxUrls: 18,
      headless,
      preserveQueryOnDiscover: true,
    });
    const probe = await Promise.race([
      probePromise,
      new Promise<Awaited<typeof probePromise>>((resolve) =>
        setTimeout(
          () =>
            resolve({
              parsed: null,
              matchedUrl: null,
              parser: null,
              fetchVia: null,
              triedUrls: [],
              discoveredUrls: [],
              deliveryUrls: [],
            }),
          PROBE_TIMEOUT_MS,
        ),
      ),
    ]);
    if (probe.parsed) {
      hit++;
      const n = probe.parsed.categories.reduce((a, x) => a + x.items.length, 0);
      const via = probe.fetchVia ? `/${probe.fetchVia}` : "";
      console.log(`HIT  ${c.name} | ${probe.parser}${via} | ${n} items`);
    } else {
      miss++;
      console.log(`MISS ${c.name} | ${c.website_url}`);
      if (probe.discoveredUrls.length) {
        console.log(`     discovered: ${probe.discoveredUrls.slice(0, 3).join(", ")}`);
      }
      if (probe.deliveryUrls.length) {
        console.log(`     delivery:   ${summarizeDeliveryUrls(probe.deliveryUrls)}`);
      }
    }
  }

  console.log(`\n${hit} hit / ${miss} miss (${candidates.length} tried)${headless ? " [headless]" : ""}`);
  } finally {
    if (headless) await closePlaywrightBrowser();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
