-- Phase 1 RLS hardening: lock down PII / write surface, keep public reads working.
--
-- Apply via:
--   npm run db:migrate:rls-hardening
--
-- Tables made read-only for the anon key:
--   restaurants, menus, menu_categories, menu_items
-- Tables fully closed to the anon key (admin client only):
--   audit_leads, claim_verification_tokens, mcp_invocations
--
-- service_role (used server-side via getSupabaseAdminClient) bypasses RLS,
-- so all admin-side writes continue to work without policy changes.
--
-- Verify with:
--   npm run db:verify:rls

------------------------------------------------------------------------------
-- 1. Public read tables
------------------------------------------------------------------------------

alter table public.restaurants     enable row level security;
alter table public.menus           enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items      enable row level security;

drop policy if exists "anon read restaurants"     on public.restaurants;
drop policy if exists "anon read menus"           on public.menus;
drop policy if exists "anon read menu_categories" on public.menu_categories;
drop policy if exists "anon read menu_items"      on public.menu_items;

create policy "anon read restaurants"
  on public.restaurants
  for select
  to anon, authenticated
  using (true);

create policy "anon read menus"
  on public.menus
  for select
  to anon, authenticated
  using (true);

create policy "anon read menu_categories"
  on public.menu_categories
  for select
  to anon, authenticated
  using (true);

create policy "anon read menu_items"
  on public.menu_items
  for select
  to anon, authenticated
  using (true);

------------------------------------------------------------------------------
-- 2. PII / write-only tables
-- RLS with no anon-facing policy = default deny for the anon role.
-- service_role bypasses RLS automatically, so server-side inserts/reads via
-- getSupabaseAdminClient() continue to work.
------------------------------------------------------------------------------

alter table public.audit_leads               enable row level security;
alter table public.claim_verification_tokens enable row level security;
alter table public.mcp_invocations           enable row level security;

-- Explicit revokes guard against ever exposing PII tables via PostgREST even
-- if a future policy is added by mistake.
revoke all on public.audit_leads               from anon, authenticated;
revoke all on public.claim_verification_tokens from anon, authenticated;
revoke all on public.mcp_invocations           from anon, authenticated;

------------------------------------------------------------------------------
-- 3. Documentation
------------------------------------------------------------------------------

comment on table public.audit_leads is
  'PII (emails). RLS enabled with no anon policy + grants revoked. service_role-only writes via getSupabaseAdminClient.';

comment on table public.claim_verification_tokens is
  'One-time tokens for self-serve menu verification. RLS enabled with no anon policy + grants revoked.';

comment on table public.mcp_invocations is
  'Server-side MCP tool telemetry. RLS enabled with no anon policy + grants revoked. service_role inserts only.';
