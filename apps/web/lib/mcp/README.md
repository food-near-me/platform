# MCP implementation (`apps/web/lib/mcp`)

HTTP JSON-RPC client and automated flow runner for `POST /mcp`.

**Host onboarding (config, tools, FAQ):** [repository README](../../../../README.md#quick-start)

| File | Role |
|------|------|
| `http-client.ts` | JSON-RPC client for flow tests |
| `mcp-flow-runner.ts` | Expected tools/resources + 10 automated flows |
| `tool-errors.ts` | Structured `_meta.error` contract for failed tool calls |

Route handler: [`../../app/mcp/route.ts`](../../app/mcp/route.ts)
