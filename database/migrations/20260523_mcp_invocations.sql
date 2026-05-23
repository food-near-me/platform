-- MCP usage instrumentation: per-tool, per-tier counters with daily rollup view.
-- Apply with: scripts/apply-mcp-invocations.mjs

create extension if not exists pgcrypto;

create table if not exists public.mcp_invocations (
  id uuid primary key default gen_random_uuid(),
  tool_name text not null,
  status text not null check (status in ('success', 'error')),
  error_code text,
  tier_returned text,
  results_count integer,
  duration_ms integer,
  occurred_at timestamptz not null default now()
);

create index if not exists mcp_invocations_occurred_at_idx
  on public.mcp_invocations (occurred_at desc);

create index if not exists mcp_invocations_tool_occurred_idx
  on public.mcp_invocations (tool_name, occurred_at desc);

-- Daily rollup view (last 30 days)
create or replace view public.mcp_invocations_daily as
select
  date_trunc('day', occurred_at) as day,
  tool_name,
  status,
  tier_returned,
  count(*)::int as invocations,
  avg(duration_ms)::int as avg_duration_ms,
  percentile_cont(0.95) within group (order by duration_ms)::int as p95_duration_ms
from public.mcp_invocations
where occurred_at > now() - interval '30 days'
group by 1, 2, 3, 4;

-- 24h tool summary (used by /api/health/mcp)
create or replace view public.mcp_invocations_24h as
select
  tool_name,
  count(*) filter (where status = 'success')::int as success_count,
  count(*) filter (where status = 'error')::int   as error_count,
  count(*)::int                                    as total_count,
  avg(duration_ms)::int                            as avg_duration_ms,
  percentile_cont(0.95) within group (order by duration_ms)::int as p95_duration_ms,
  max(occurred_at)                                 as last_invocation_at
from public.mcp_invocations
where occurred_at > now() - interval '24 hours'
group by 1;

-- Tier-distribution rollup (last 24h) for honest "tier returned" metrics
create or replace view public.mcp_tier_distribution_24h as
select
  tool_name,
  tier_returned,
  count(*)::int as invocations
from public.mcp_invocations
where occurred_at > now() - interval '24 hours'
  and tier_returned is not null
group by 1, 2;
