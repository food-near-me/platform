#!/usr/bin/env npx tsx
/**
 * Promote discovered restaurants to menu_indexed with MP-shaped menus from seed JSON.
 *
 * Usage:
 *   npm run db:migrate:three-tier          # once — from repo root
 *   npm run db:import:menu-indexed -- --dry-run
 *   npm run db:import:menu-indexed
 *   npm run db:import:menu-indexed -- --file=scripts/data/menu-indexed-seeds.json
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (or anon) + NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type MenuItemSeed = {
  name: string;
  description?: string;
  price: number;
  dietary_vegetarian?: boolean;
  dietary_vegan?: boolean;
  dietary_gluten_free?: boolean;
  allergens?: string[];
  prep_time?: number;
};

type CategorySeed = {
  name: string;
  items: MenuItemSeed[];
};

type SeedEntry = {
  restaurant_id?: string;
  match?: {
    name_ilike?: string;
    lat: number;
    lng: number;
    radius_m?: number;
  };
  menu_source: string;
  categories: CategorySeed[];
};

type SeedFile = {
  seeds: SeedEntry[];
};

function parseArgs(argv: string[]) {
  let dryRun = false;
  let file = resolve(process.cwd(), "scripts/data/menu-indexed-seeds.json");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") dryRun = true;
    if (argv[i]?.startsWith("--file=")) file = resolve(process.cwd(), argv[i].slice(7));
  }
  return { dryRun, file };
}

async function findRestaurant(seed: SeedEntry): Promise<{ id: string; name: string; verification_status: string } | null> {
  if (seed.restaurant_id) {
    const { data } = await supabase
      .from("restaurants")
      .select("id, name, verification_status")
      .eq("id", seed.restaurant_id)
      .maybeSingle();
    return data;
  }

  if (!seed.match) return null;

  const { lat, lng, radius_m = 500, name_ilike } = seed.match;
  const { data, error } = await supabase.rpc("search_restaurants_for_agents", {
    search_query: "",
    lat,
    lng,
    radius_meters: radius_m,
    min_agent_score: 0,
    dietary_filters: [],
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  const candidates = (data || []) as Array<{
    id: string;
    name: string;
    verification_status: string;
  }>;

  const filtered = name_ilike
    ? candidates.filter((r) =>
        r.name.toLowerCase().includes(name_ilike.replace(/%/g, "").toLowerCase()),
      )
    : candidates;

  const pick =
    filtered.find((r) => r.verification_status === "discovered") ??
    filtered.find((r) => r.verification_status === "menu_indexed") ??
    filtered[0];

  return pick ?? null;
}

async function upsertMenu(
  restaurantId: string,
  seed: SeedEntry,
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    const count = seed.categories.reduce((n, c) => n + c.items.length, 0);
    console.log(`  [dry-run] would insert ${count} items`);
    return count;
  }

  const { data: existingMenu } = await supabase
    .from("menus")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "published")
    .maybeSingle();

  let menuId = existingMenu?.id;

  if (!menuId) {
    const { data: menu, error: menuError } = await supabase
      .from("menus")
      .insert({
        restaurant_id: restaurantId,
        protocol_version: "1.0",
        status: "published",
      })
      .select("id")
      .single();

    if (menuError || !menu) {
      throw new Error(`Menu insert failed: ${menuError?.message}`);
    }
    menuId = menu.id;
  }

  let itemCount = 0;

  for (let catIdx = 0; catIdx < seed.categories.length; catIdx++) {
    const cat = seed.categories[catIdx];

    const { data: category, error: catError } = await supabase
      .from("menu_categories")
      .insert({
        menu_id: menuId,
        name: cat.name,
        sort_order: catIdx,
      })
      .select("id")
      .single();

    if (catError || !category) {
      throw new Error(`Category insert failed: ${catError?.message}`);
    }

    for (const item of cat.items) {
      const { error: itemError } = await supabase.from("menu_items").insert({
        category_id: category.id,
        name: item.name,
        description: item.description ?? "",
        price: item.price,
        currency: "USD",
        available: true,
        preparation_time_minutes: item.prep_time ?? 15,
        dietary_vegetarian: item.dietary_vegetarian ?? false,
        dietary_vegan: item.dietary_vegan ?? false,
        dietary_gluten_free: item.dietary_gluten_free ?? false,
        dietary_halal: false,
        dietary_kosher: false,
        dietary_nut_free: !(
          item.allergens?.includes("tree_nuts") || item.allergens?.includes("peanuts")
        ),
        allergens: item.allergens ?? [],
        popularity_score: 3.0,
      });

      if (itemError) {
        throw new Error(`Item insert failed (${item.name}): ${itemError.message}`);
      }
      itemCount++;
    }
  }

  const { error: statusError } = await supabase
    .from("restaurants")
    .update({
      verification_status: "menu_indexed",
      source: seed.menu_source,
      updated_at: new Date().toISOString(),
    })
    .eq("id", restaurantId)
    .neq("verification_status", "verified");

  if (statusError) {
    throw new Error(`Status update failed: ${statusError.message}`);
  }

  return itemCount;
}

async function main() {
  const { dryRun, file } = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(readFileSync(file, "utf8")) as SeedFile;

  console.log(`Menu indexed import — ${payload.seeds.length} seed(s)${dryRun ? " [DRY RUN]" : ""}`);
  console.log(`File: ${file}\n`);

  let promoted = 0;
  let items = 0;
  let skipped = 0;

  for (const seed of payload.seeds) {
    const restaurant = await findRestaurant(seed);
    if (!restaurant) {
      console.log("✗ No match found", seed.match ?? seed.restaurant_id);
      skipped++;
      continue;
    }

    if (restaurant.verification_status === "verified") {
      console.log(`⊘ Skip verified: ${restaurant.name} (${restaurant.id})`);
      skipped++;
      continue;
    }

    const { data: existingPublished } = await supabase
      .from("menus")
      .select("id")
      .eq("restaurant_id", restaurant.id)
      .eq("status", "published")
      .maybeSingle();

    if (restaurant.verification_status === "menu_indexed" && existingPublished) {
      console.log(`⊘ Already menu_indexed with menu: ${restaurant.name}`);
      skipped++;
      continue;
    }

    console.log(`→ ${restaurant.name} (${restaurant.id}) [${restaurant.verification_status}]`);

    try {
      const count = await upsertMenu(restaurant.id, seed, dryRun);
      items += count;
      promoted++;
      console.log(`  ✓ ${dryRun ? "would promote" : "promoted"} to menu_indexed (${count} items)`);
    } catch (error) {
      console.error(`  ✗ ${error instanceof Error ? error.message : error}`);
      skipped++;
    }
  }

  console.log(`\nDone: ${promoted} promoted, ${items} items, ${skipped} skipped`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
