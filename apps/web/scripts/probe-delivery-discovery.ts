#!/usr/bin/env npx tsx
/**
 * Report how many probe misses expose free delivery-platform store URLs
 * (Uber Eats, DoorDash, Grubhub) — diagnostic for future parser work.
 *
 *   npm run db:probe:delivery -- --headless --limit=25
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "node:path";
import {
  deliveryPlatformLabel,
  summarizeDeliveryUrls,
} from "../lib/menu-ingest/delivery-platform-urls";
import { closePlaywrightBrowser } from "../lib/menu-ingest/fetch-website-playwright";
import { probeWebsiteForMenu } from "../lib/menu-ingest/probe-website-menu";
import {
  gridCellRadiusMeters,
  gridSamplePoints,
  rankWebsiteCandidates,
} from "../lib/menu-ingest/website-candidates";
import { resolveRegion } from "./lib/load-import-regions";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const headless = process.argv.includes("--headless");
const limit = Number.parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.slice(8) ?? "25",
  10,
);
const regionKey =
  process.argv.find((a) => a.startsWith("--region="))?.slice(9) ?? "williamsburg";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  try {
    const region = resolveRegion(regionKey);
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

    const candidates = rankWebsiteCandidates(rows ?? [], {
      includeChains: false,
    }).slice(0, limit);

    let hits = 0;
    let misses = 0;
    let missesWithDelivery = 0;
    const platformCounts = new Map<string, number>();

    for (const c of candidates) {
      const probe = await probeWebsiteForMenu(c.website_url, {
        maxUrls: 14,
        headless,
      });

      if (probe.parsed) {
        hits++;
        continue;
      }

      misses++;
      if (probe.deliveryUrls.length === 0) {
        console.log(`MISS (no delivery) ${c.name}`);
        continue;
      }

      missesWithDelivery++;
      for (const url of probe.deliveryUrls) {
        const label = deliveryPlatformLabel(url);
        platformCounts.set(label, (platformCounts.get(label) ?? 0) + 1);
      }
      console.log(`MISS + delivery ${c.name}`);
      console.log(`  ${summarizeDeliveryUrls(probe.deliveryUrls)}`);
    }

    console.log(`\n--- ${regionKey} delivery discovery ---`);
    console.log(`Menu hits: ${hits}/${candidates.length}`);
    console.log(
      `Misses with delivery URL: ${missesWithDelivery}/${misses} misses (${candidates.length} tried)`,
    );
    if (platformCounts.size) {
      console.log(
        "Platforms on misses:",
        [...platformCounts.entries()].map(([k, v]) => `${k}=${v}`).join(", "),
      );
    }
    if (headless) console.log("(headless enabled)");
  } finally {
    if (headless) await closePlaywrightBrowser();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
