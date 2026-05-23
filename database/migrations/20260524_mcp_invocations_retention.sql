-- mcp_invocations retention policy: keep 90 days of raw rows.
--
-- Why: the table grows ~monotonically with traffic. Rollup views
-- (mcp_invocations_24h, mcp_invocations_daily) cover the public
-- /api/health/mcp endpoint, and operational debugging rarely needs
-- more than ~3 months of raw rows. Without retention, the table
-- balloons silently and slows the rollup views.
--
-- Strategy: provide a SQL function the Vercel cron route can call
-- daily. Function is idempotent and safe to run multiple times.
-- We could partition by month for cheaper deletes, but at our
-- expected volume (low millions/year) a single bounded delete is
-- both simpler and adequately fast (occurred_at index makes it
-- O(rows-being-deleted)).
--
-- Apply with: npm run db:migrate:mcp-invocations-retention

create or replace function public.cleanup_old_mcp_invocations(
  retention_days integer default 90
)
returns integer
language plpgsql
security definer
as $$
declare
  rows_deleted integer;
begin
  if retention_days < 30 then
    raise exception 'retention_days must be >= 30, got %', retention_days;
  end if;

  delete from public.mcp_invocations
   where occurred_at < now() - make_interval(days => retention_days);

  get diagnostics rows_deleted = row_count;
  return rows_deleted;
end;
$$;

comment on function public.cleanup_old_mcp_invocations(integer) is
  'Deletes mcp_invocations rows older than N days (default 90). Called daily from the Vercel cron route /api/cron/cleanup-mcp-invocations.';
