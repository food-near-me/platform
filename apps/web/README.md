# apps/web — foodnear.me

Next.js app: landing, API routes, and the **MCP server** at `/mcp`.

## MCP host onboarding

**Start here (Venice-style canonical doc):** [../../README.md#quick-start](../../README.md#quick-start)

- **Production MCP:** `https://foodnear.me/mcp`
- **Public quick reference:** https://foodnear.me/docs#quick-start
- **Implementation:** [`app/mcp/route.ts`](app/mcp/route.ts) · [`lib/mcp/`](lib/mcp/)

## Local development

```bash
cp .env.example .env.local   # Supabase
npm run dev                    # :3000
npm run test:mcp-flows         # MCP flows against localhost
npm run smoke:mcp              # list/count probes
./scripts/deploy-preflight.sh  # post-deploy discovery checks
```

## Other docs

- [`docs/example-agent-flows.md`](docs/example-agent-flows.md) — scripted agent QA flows
- [`docs/registry-submission-guide.md`](docs/registry-submission-guide.md) — MCP registry submissions
