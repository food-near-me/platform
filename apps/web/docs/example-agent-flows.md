# Example Agent Flows — foodnear.me MCP

> **Purpose:** Scripted multi-turn workflows that prove foodnear.me is usable by real agents — not just documented. Use for registry submissions, QA, demos, and `SKILL.md` expansion.
>
> **Last updated:** 2026-05-19  
> **Related:** [Host README (canonical)](https://github.com/food-near-me/platform#quick-start) · [`SKILL.md`](https://foodnear.me/SKILL.md) · [`openapi.json`](https://foodnear.me/openapi.json) · [08-application-food-near-me.md](../../../../Claude%20Learnings/remix/08-application-food-near-me.md)

---

## How to use this doc

| Audience | Use it for |
|---|---|
| **AI agents / MCP clients** | Follow tool sequences; respect dietary/allergen boundaries |
| **Developers** | Pre-registry QA; smoke tests after deploy |
| **Registry reviewers** | Evidence of "running skills & agents" |
| **Internal team** | Demo scripts; Doma Agentic Engine tier evidence |

Each flow includes:

1. **User prompt** — what a human might ask
2. **Tool sequence** — MCP tools in order
3. **Example calls** — JSON-RPC `tools/call` payloads
4. **Agent response rules** — what to say and what to avoid
5. **Success criteria** — how to know the flow worked

---

## MCP connection

| Transport | URL |
|---|---|
| HTTP JSON-RPC | `POST https://foodnear.me/mcp` |
| Discovery | `GET https://foodnear.me/mcp` |

**Discovery files:**

- `https://foodnear.me/.well-known/mcp-server.json`
- `https://foodnear.me/.well-known/agentroot.json`
- `https://foodnear.me/SKILL.md`
- `https://foodnear.me/openapi.json`

**Resources (optional context):**

| URI | Use |
|---|---|
| `foodnearme://spec/menu-protocol` | Menu Protocol v1.0 schema |
| `foodnearme://spec/openapi` | REST API spec pointer |
| `foodnearme://agent/skill` | Quick-start skill summary |
| `foodnearme://examples/search-flow` | Minimal search → menu flow |

---

## Global rules for every flow

### Always

- Prefer **MCP tools** over training-data guesses for menu data.
- Only cite **verified** restaurants returned by `search_restaurants`.
- Read **`dietary.*` boolean flags** and **`allergens[]`** on each menu item — do not infer.
- Include **restaurant name** and **verification** when presenting options.
- Add disclaimer: verified menu data is not medical or legal advice for allergies.

### Never

- Present unverified or scraped menu data as authoritative.
- Guarantee allergen safety without user confirmation.
- Call write tools — MCP is **read-only** in v1.

---

## Tool reference (quick)

| Tool | Purpose |
|---|---|
| `search_restaurants` | Three-tier geo search: verified → menu_indexed → discovered — check `menu_available` and `verification_status` |
| `get_restaurant` | Schema.org/Restaurant profile + ADO score |
| `get_menu` | Full Menu Protocol v1.0 menu with signatures |
| `get_ado_score_breakdown` | Weighted ADO factors + improvement tips |

---

## Flow A: Dietary-safe search

**User prompt:** "Find vegan Thai near Brooklyn Bridge"

### Tool sequence

1. `search_restaurants`
2. `get_menu` (top result)
3. Filter items client-side

### Example calls

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_restaurants",
    "arguments": {
      "lat": 40.7128,
      "lng": -74.006,
      "query": "thai",
      "dietary": ["vegan"],
      "radius_miles": 10
    }
  }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_menu",
    "arguments": {
      "restaurant_id": "<id from search results>"
    }
  }
}
```

### Agent response rules

- Rank by `agent_score` when multiple results.
- Filter `menu.items` where `dietary.vegan === true`.
- Mention distance and preparation time when available.

### Success criteria

- Search returns structured `results[]` with `id`, `name`, `agent_score`.
- Menu returns Menu Protocol v1.0 with explicit dietary booleans.

---

## Flow B: Allergen check

**User prompt:** "Does Joe's Pizza have nut-free options?"

### Tool sequence

1. `search_restaurants` (name query + user location)
2. `get_menu`
3. Scan `allergens[]`; exclude items containing tree nuts / peanuts

### Example call

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_restaurants",
    "arguments": {
      "lat": 40.7128,
      "lng": -74.006,
      "query": "Joe's Pizza",
      "radius_miles": 10
    }
  }
}
```

### Agent response rules

- Warn that menu data is owner-verified but **not a substitute for asking the restaurant**.
- List items where `dietary.nut_free === true` **and** allergens array excludes nuts.

### Success criteria

- Agent cites menu items with explicit flags, not guesses.

---

## Flow C: ADO improvement (restaurant-facing)

**User prompt:** "Why isn't my restaurant ranking well for agents?"

### Tool sequence

1. `get_ado_score_breakdown`
2. `resources/read` → `foodnearme://spec/menu-protocol`

### Example call

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_ado_score_breakdown",
    "arguments": {
      "restaurant_id": "<uuid>"
    }
  }
}
```

### Success criteria

- Response includes weighted `breakdown` and actionable `recommendations[]`.

---

## Flow D: Developer validates Menu Protocol (planned)

**User prompt:** "Is this JSON valid Menu Protocol?"

### Tool sequence

1. `validate_menu_protocol` ← **not built yet** (deliverable #3)

Until shipped, use `@foodnearme/menu-protocol` npm package locally.

---

## Automated QA

Run scripted flows against local or production MCP:

```bash
# From apps/web — dev server must be running for localhost
npm run test:mcp-flows

# Production / staging
npm run test:mcp-flows:http
# or
MCP_URL=https://foodnear.me npm run test:mcp-flows
```

Pre-deploy artifact check:

```bash
./scripts/deploy-preflight.sh https://foodnear.me
```

### Flow IDs exercised by automation

| ID | Flow |
|---|---|
| `tools-list` | All 4 tools registered |
| `resources-list` | All 4 resources registered |
| `flow-static-validation` | Invalid lat rejected |
| `flow-static-dietary` | Invalid dietary filter rejected |
| `flow-static-uuid` | Invalid UUID rejected |
| `flow-a` | Vegan Thai search |
| `flow-a-chain` | Search → get_menu |
| `flow-c` | ADO score breakdown |

DB-dependent flows skip when Supabase env is missing or seed data is empty.

---

## Registry evidence checklist

- [ ] `example-agent-flows.md` (this doc) linked from `SKILL.md`
- [ ] `npm run test:mcp-flows:http` passes on production
- [ ] `./scripts/deploy-preflight.sh` passes on production
- [ ] At least one beta city with verified restaurants for non-empty demos
