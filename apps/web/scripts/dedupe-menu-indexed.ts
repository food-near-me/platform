#!/usr/bin/env npx tsx
/**
 * Demote duplicate menu_indexed rows that share the same website host.
 * Keeps the row with the most menu items; tie-break by earliest created_at.
 *
 * Usage:
 *   npm run db:dedupe:menu-indexed:dry-run
 *   npm run db:dedupe:menu-indexed
 *   npm run db:dedupe:menu-indexed:dry-run -- --host=mesacoyoacan.com
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "node:path";
import { websiteHostKey } from "../lib/menu-ingest/website-candidates";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type IndexedRow = {
  id: string;
  name: string;
  website_url: string | null;
  source: string | null;
  created_at: string;
  itemCount: number;
  host: string | null;
};

function parseArgs(argv: string[]): { dryRun: boolean; hostFilter: string | null } {
  let dryRun = false;
  let hostFilter: string | null = null;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    if (arg.startsWith("--host=")) hostFilter = arg.slice(7).toLowerCase().replace(/^www\./, "");
  }

  return { dryRun, hostFilter };
}

async function countPublishedItems(restaurantId: string): Promise<number> {
  const { data: menus } = await supabase
    .from("menus")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "published");

  if (!menus?.length) return 0;

  let total = 0;
  for (const menu of menus) {
    const { data: cats } = await supabase
      .from("menu_categories")
      .select("id")
      .eq("menu_id", menu.id);
    for (const cat of cats ?? []) {
      const { count } = await supabase
        .from("menu_items")
        .select("*", { count: "exact", head: true })
        .eq("category_id", cat.id);
      total += count ?? 0;
    }
  }
  return total;
}

async function demoteDuplicate(row: IndexedRow, keepId: string, dryRun: boolean): Promise<void> {
  console.log(`  demote ${row.name} (${row.id}) — keep ${keepId}`);
  if (dryRun) return;

  const { data: menus } = await supabase
    .from("menus")
    .select("id")
    .eq("restaurant_id", row.id);

  for (const menu of menus ?? []) {
    await supabase.from("menus").delete().eq("id", menu.id);
  }

  const { error } = await supabase
    .from("restaurants")
    .update({
      verification_status: "discovered",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("verification_status", "menu_indexed");

  if (error) {
    throw new Error(`Failed to demote ${row.id}: ${error.message}`);
  }
}

function pickKeeper(rows: IndexedRow[]): IndexedRow {
  return [...rows].sort((a, b) => {
    if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })[0];
}

async function main() {
  const { dryRun, hostFilter } = parseArgs(process.argv.slice(2));

  console.log(`Dedupe menu_indexed by website host${dryRun ? " [DRY RUN]" : ""}\n`);

  const { data: rows, error } = await supabase
    .from("restaurants")
    .select("id, name, website_url, source, created_at")
    .eq("verification_status", "menu_indexed")
    .not("website_url", "is", null)
    .order("created_at");

  if (error) throw new Error(`Load failed: ${error.message}`);

  const enriched: IndexedRow[] = [];
  for (const row of rows ?? []) {
    const host = row.website_url ? websiteHostKey(row.website_url) : null;
    if (!host) continue;
    if (hostFilter && host !== hostFilter) continue;
    enriched.push({
      ...row,
      itemCount: await countPublishedItems(row.id),
      host,
    });
  }

  const byHost = new Map<string, IndexedRow[]>();
  for (const row of enriched) {
    if (!row.host) continue;
    const group = byHost.get(row.host) ?? [];
    group.push(row);
    byHost.set(row.host, group);
  }

  const duplicateGroups = [...byHost.entries()].filter(([, group]) => group.length > 1);

  if (duplicateGroups.length === 0) {
    console.log("No duplicate hosts found among menu_indexed rows.");
    return;
  }

  let demoted = 0;

  for (const [host, group] of duplicateGroups) {
    const keeper = pickKeeper(group);
    const losers = group.filter((row) => row.id !== keeper.id);

    console.log(`Host ${host}:`);
    console.log(
      `  keep ${keeper.name} (${keeper.id}) — ${keeper.itemCount} items, created ${keeper.created_at}`,
    );

    for (const loser of losers) {
      await demoteDuplicate(loser, keeper.id, dryRun);
      demoted++;
    }
    console.log("");
  }

  console.log(`Done: ${demoted} demoted across ${duplicateGroups.length} duplicate host(s)`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
