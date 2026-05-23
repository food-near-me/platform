-- Persistent dead/placeholder site cache for the menu ingest pipeline.
--
-- Problem this solves:
--   The ingest pipeline currently re-probes every discovered restaurant on
--   each run, including thousands that have permanently dead/placeholder
--   homepages ("coming soon", "page not found", 50-byte static HTML). Each
--   wasted probe costs ~30-60s of headless Chromium time. A simple per-
--   host cache lets us short-circuit those re-probes for 30 days.
--
-- Scope:
--   * Caches by host, not by full URL. Practically, if "example.com/" is
--     dead the menu paths under example.com are too, and the host:
--     restaurant relationship in our data is ~1:1.
--   * Negative-only cache: we only persist the "dead/placeholder" verdict.
--     "Alive" sites would be re-probed anyway because menus appear /
--     disappear from live sites.
--
-- TTL:
--   30 days. Sites that came back online get re-probed eventually without
--   manual intervention.
--
-- Apply with: npm run db:migrate:site-health-cache

create extension if not exists pgcrypto;

create table if not exists public.site_health_cache (
  host text primary key,
  source_url text,
  dead boolean not null,
  checked_at timestamptz not null default now()
);

create index if not exists site_health_cache_checked_at_idx
  on public.site_health_cache (checked_at desc);

comment on table public.site_health_cache is
  '30-day TTL cache: hosts whose homepages parse as dead/placeholder. Read by lib/menu-ingest/site-health-cache.ts before every probe.';
