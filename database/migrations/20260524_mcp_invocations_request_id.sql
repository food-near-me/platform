-- Add request_id column to mcp_invocations for HTTP-to-row correlation.
--
-- Origin: phase 4c observability work in
-- /Users/home/projects/docs/Food Near Me/engineering-roadmap-2026-05-23.md.
--
-- The MCP HTTP transport now mints (or accepts) a request id on every
-- POST and returns it on `X-Request-ID`. Storing it on the invocation
-- row lets us answer "which Supabase row did the agent's request 7f43...
-- produce?" without having to grep timestamps.
--
-- Backfill: leave existing rows NULL (no historical ids available).
-- New rows after this migration will be populated by the route handler.
--
-- Apply with: npm run db:migrate:mcp-invocations-request-id

alter table public.mcp_invocations
  add column if not exists request_id text;

create index if not exists mcp_invocations_request_id_idx
  on public.mcp_invocations (request_id);
