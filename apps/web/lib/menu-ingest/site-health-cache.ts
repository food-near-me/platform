/**
 * Persistent dead-site cache for the menu probe pipeline.
 *
 * The heuristic in lib/menu-ingest/site-health.ts decides whether a
 * fetched homepage is "dead/placeholder" — i.e. probing it will not
 * yield a menu. Without persistence we re-execute that heuristic on
 * every ingest run for every restaurant whose homepage is permanently
 * dead, burning ~30-60s of headless Chromium per site.
 *
 * This module persists the dead verdict to `site_health_cache` for 30
 * days, keyed by URL host. Callers should:
 *
 *   - Read with `isSiteCachedDead(seedUrl)` before kicking off a probe.
 *     On cache hit, finalize the probe immediately with parsed=null.
 *   - Write with `cacheDeadSite(seedUrl)` whenever the dead-or-placeholder
 *     heuristic returns true mid-probe.
 *
 * Both functions degrade silently when the Supabase admin client is
 * unconfigured (local dev without `SUPABASE_SERVICE_ROLE_KEY`), so
 * probes still work in that environment, just without the cache speedup.
 */

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const CACHE_TTL_DAYS = 30;
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

export const SITE_HEALTH_CACHE_TTL_DAYS = CACHE_TTL_DAYS;

function extractHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function adminClientOrNull() {
  try {
    return getSupabaseAdminClient();
  } catch {
    return null;
  }
}

export type SiteHealthCacheHit = {
  host: string;
  checkedAt: string;
  ageMs: number;
};

/**
 * Returns a cache hit when the host has been recorded as dead within
 * the TTL. Returns null on miss, on cache disabled, or on any error
 * (fail-open: a missed cache lookup must not block a real probe).
 */
export async function isSiteCachedDead(
  rawUrl: string,
): Promise<SiteHealthCacheHit | null> {
  const host = extractHost(rawUrl);
  if (!host) return null;

  const supabase = adminClientOrNull();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("site_health_cache")
      .select("host, dead, checked_at")
      .eq("host", host)
      .maybeSingle();

    if (error || !data || !data.dead) return null;

    const checkedAt = new Date(data.checked_at as string);
    const ageMs = Date.now() - checkedAt.getTime();
    if (ageMs >= CACHE_TTL_MS) return null;

    return { host, checkedAt: data.checked_at as string, ageMs };
  } catch {
    return null;
  }
}

/**
 * Best-effort upsert recording a host as dead. Never throws; never
 * blocks the probe pipeline on a write failure (probes that hit
 * the dead heuristic will just be re-evaluated on the next run if the
 * write was lost).
 */
export async function cacheDeadSite(rawUrl: string): Promise<void> {
  const host = extractHost(rawUrl);
  if (!host) return;

  const supabase = adminClientOrNull();
  if (!supabase) return;

  try {
    await supabase.from("site_health_cache").upsert(
      {
        host,
        source_url: rawUrl,
        dead: true,
        checked_at: new Date().toISOString(),
      },
      { onConflict: "host" },
    );
  } catch {
    // Best-effort.
  }
}
