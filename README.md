# Food Near Me — MCP Server

> **Model Context Protocol server for AI-native restaurant discovery** — three-tier search (verified → menu_indexed → discovered), Menu Protocol menus, and structured menu validation. Plug into Claude Desktop, Cursor, ChatGPT, or any MCP host in about 30 seconds.

[![MCP Registry](https://img.shields.io/badge/MCP-me.foodnear%2Ffoodnear--me-blue)](https://registry.modelcontextprotocol.io/v0.1/servers?search=me.foodnear/foodnear-me)

**Production endpoint:** `https://foodnear.me/mcp` · **5 tools** · **4 resources** · **3 prompts** · **No API key** (beta)

---

## Quick start {#quick-start}

### 1. Add this to your MCP host config

**Cursor** — `~/.cursor/mcp.json` (macOS/Linux) or `%USERPROFILE%\.cursor\mcp.json` (Windows)

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "foodnear-me": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://foodnear.me/mcp"]
    }
  }
}
```

### 2. Restart your MCP host

### 3. Try a prompt

> “Find vegan Thai restaurants near Brooklyn Bridge and show me a menu for the top result.”

Your agent should call `search_restaurants` → `get_menu` (or `get_restaurant` first).

---

## What you get

### Tools (5)

| Tool | Description |
|------|-------------|
| `search_restaurants` | Three-tier geo search by `lat`/`lng` — verified → menu_indexed → discovered; check `menu_available` before `get_menu` |
| `get_restaurant` | Restaurant profile with Schema.org JSON-LD + Menu Protocol extensions |
| `get_menu` | Full Menu Protocol v1.0 menu (dietary flags, allergens, signatures) |
| `get_ado_score_breakdown` | ADO score factors and improvement recommendations |
| `validate_menu_protocol` | Validate a Menu Protocol JSON payload before publish |

### Resources (4)

| URI | Content |
|-----|---------|
| `foodnearme://spec/menu-protocol` | Menu Protocol v1.0 specification |
| `foodnearme://spec/openapi` | OpenAPI 3.1 spec pointer |
| `foodnearme://agent/skill` | Agent skill summary |
| `foodnearme://examples/search-flow` | Example search → menu flow |

### Prompts (3)

| Prompt | Args | Guides agent to |
|--------|------|-----------------|
| `find_dinner_near_me` | `location` (required), `cuisine?`, `dietary?` | `search_restaurants` → `get_menu` |
| `dietary_constrained_menu` | `restaurant_id`, `restrictions` | `get_menu` with explicit MP flags/allergens |
| `validate_my_menu` | `strict?` (`true` for strict mode) | `validate_menu_protocol` |

---

## Configuration

| Setting | Value |
|---------|--------|
| **MCP URL** | `https://foodnear.me/mcp` |
| **Transport** | HTTP JSON-RPC (`POST`); discovery via `GET /mcp` |
| **Auth** | None during beta (rate limits apply) |
| **Registry** | `me.foodnear/foodnear-me` ([official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=me.foodnear/foodnear-me)) |

**Preview / local:** Replace the URL with `http://localhost:3000/mcp` when running `npm run dev` in `apps/web`.

---

## Architecture

```
┌─────────────────────┐     POST /mcp (JSON-RPC)     ┌─────────────────────────┐
│  MCP host           │ ────────────────────────────▶│  apps/web/app/mcp       │
│  (Cursor / Claude)  │     GET /mcp (discovery)     │  Next.js route handler  │
└─────────────────────┘                              └────────────┬────────────┘
                                                                │
                                                                ▼
                                                   ┌─────────────────────────┐
                                                   │  Supabase + PostGIS     │
                                                   │  Menu Protocol (MP)     │
                                                   └─────────────────────────┘
```

Implementation: [`apps/web/app/mcp/route.ts`](apps/web/app/mcp/route.ts) · Flow runner: [`apps/web/lib/mcp/mcp-flow-runner.ts`](apps/web/lib/mcp/mcp-flow-runner.ts)

---

## Tool error contract

Failed `tools/call` responses include structured metadata in `_meta.error`:

| Field | Meaning |
|-------|---------|
| `code` | `VALIDATION_ERROR` · `NOT_FOUND` · `UPSTREAM` · `RATE_LIMITED` · `UNKNOWN` |
| `message` | What went wrong |
| `hint` | How to fix the request |
| `retryable` | Whether the agent should retry |
| `docs` | https://foodnear.me/docs#quick-start |

Human-readable text is still in `content[0].text` for hosts that ignore `_meta`.

---

## Verify

From repo root (with `apps/web` dev server running for localhost):

```bash
# Automated agent flows (14 flows when Supabase + seed configured; 11 without DB)
npm run test:mcp-flows

# Against production
npm run test:mcp-flows:http

# Discovery GETs + MCP tools/list count
npm run smoke:mcp

# Three-tier trust model copy parity (local files)
npm run check:discovery-copy

# Full deploy gate (13 checks + discovery copy on production URL)
npm run preflight -w web
# or: ./apps/web/scripts/deploy-preflight.sh https://foodnear.me
```

**Production monitoring:** GitHub Actions workflow `MCP Production Smoke` runs `smoke:mcp` daily and on manual dispatch (`.github/workflows/mcp-smoke.yml`).

---

## Agent discovery

| File | URL |
|------|-----|
| `llms.txt` | https://foodnear.me/llms.txt |
| `llms-full.txt` | https://foodnear.me/llms-full.txt |
| MCP manifest | https://foodnear.me/.well-known/mcp-server.json |
| AgentRoot | https://foodnear.me/.well-known/agentroot.json |
| Skill file | https://foodnear.me/SKILL.md |
| OpenAPI | https://foodnear.me/openapi.json |
| Web quick reference | https://foodnear.me/docs |

Scripted flows: [`apps/web/docs/example-agent-flows.md`](apps/web/docs/example-agent-flows.md)

---

## Data trust model (three-tier search)

- `search_restaurants` returns **verified** → **menu_indexed** → **discovered**.
- Every result includes `verification_status` and `menu_available`. Call `get_menu` only when `menu_available` is true.
- **Verified** — owner-approved MP; authoritative for dietary/allergen claims.
- **menu_indexed** — automated/public MP menu; cite with caveat — not owner-verified.
- **discovered** — place only; do not cite menu items.
- Trust progression: `discovered` → `menu_indexed` → `verified`. See https://foodnear.me/attribution for data sources.

---

## FAQ

**Do I need an API key?**  
No for beta MCP access. Future paid tiers may use API keys or x402 (USDC on Base). See `x402-prepaid-spec.md` in your local `docs/Food Near Me` playbook.

**Tools not showing after restart?**  
Confirm the config URL ends with `/mcp`. Restart the host completely. Run `npm run smoke:mcp` against your target base URL.

**Empty search results?**  
Beta verified menus are seeded for specific metros (e.g. Williamsburg, NYC). **7 `menu_indexed`** restaurants in Williamsburg have automated menus from website ingest. Discovered place listings cover many US metros — use coordinates in an imported region. Demo coords: `40.7128, -74.006`. Run `npm run db:seed -w web` locally for verified test data.

**Cursor vs Claude config path?**  
See Quick start above — each host uses a different JSON file; only the `mcpServers` block matters.

**How is this different from DoorDash / Uber Eats APIs?**  
We expose **owner-verified Menu Protocol** data for agents — not scraped aggregator menus or ordering checkout.

---

## Monorepo layout

This repository ships the MCP server inside the `foodnear.me` web app:

| Path | Purpose |
|------|---------|
| [`apps/web`](apps/web) | Next.js app — **MCP at `/mcp`**, landing, API routes |
| [`packages/menu-protocol`](packages/menu-protocol) | Menu Protocol schema + validators |
| [`database`](database) | Migrations, seeds, schema |
| [`server.json`](server.json) | Official MCP Registry metadata |

Business strategy and runbooks live in a **separate local docs folder** (not in this repo) — see your team's `docs/Food Near Me` playbook.

---

## Development

```bash
npm install
cd apps/web && cp .env.example .env.local   # Supabase keys
npm run dev                                 # http://localhost:3000
npm run test:mcp-flows                      # POST localhost:3000/mcp
```

### Operator: `menu_indexed` website ingest

Promote **discovered** → **menu_indexed** via free website/ordering-platform parsers (ChowNow API, order.online, Sauce, Squarespace, BentoBox, Toast, Playwright). **Always dry-run first** — headless is slow.

```bash
cd apps/web
npm run db:probe:menu-batch -- --headless --limit=10
npm run db:import:menu-indexed:website:headless:dry-run -- --limit=10
npm run db:import:menu-indexed:website:headless -- --limit=10   # live
```

No Uber Eats / DoorDash / Grubhub / RapidAPI scrapers. See [`apps/web/docs/example-agent-flows.md`](apps/web/docs/example-agent-flows.md).

---

## Links

- **Website:** https://foodnear.me  
- **GitHub:** https://github.com/food-near-me/platform  
- **Menu Protocol spec:** https://github.com/foodnearme/menu-protocol  
- **Support:** https://foodnear.me/support · api@foodnear.me
