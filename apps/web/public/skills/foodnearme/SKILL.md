# foodnear.me Agent Skill

> **Canonical agent skill for foodnear.me.** A previous, single-file version lived at `/SKILL.md`. That URL is now a short hub that points here; the full skill, parameter reference, and recipes have moved into this directory.

## Description

Find restaurants near a location and retrieve structured, AI-optimized menus in Menu Protocol (MP) format. Menu Protocol is a strict superset of Schema.org/Restaurant and Schema.org/MenuItem, designed for reliable agent parsing.

## Where things live

| What | Path |
|------|------|
| This canonical skill | `/skills/foodnearme/SKILL.md` |
| Tool parameter reference | [`/skills/foodnearme/references/tools-api.md`](./references/tools-api.md) |
| Recipe: verified gluten-free menu discovery | [`/skills/foodnearme/references/dietary-search.md`](./references/dietary-search.md) |
| Recipe: validate your own restaurant's menu | [`/skills/foodnearme/references/menu-verification-flow.md`](./references/menu-verification-flow.md) |

## Capabilities

- **search**: Three-tier geo search — verified → menu_indexed → discovered. Cuisine/text and location/radius apply to every tier; **`dietary` and `min_ado_score` filters apply only to the verified tier** (menu_indexed and discovered rows pass through unfiltered for those fields — re-filter at item level via `menu`). The response echoes `filters.applied_to: ["verified"]` and a `filters.note`.
- **restaurant**: Fetch detailed restaurant profiles with Schema.org JSON-LD markup.
- **menu**: Retrieve full menus in Menu Protocol v1.0 format with dietary flags, allergens, customization options, and cryptographic owner approval signatures.
- **composite workflows**: Three FNM-unique composites add multi-tool intent flows: tier-bucketed neighborhood exploration, dietary comparison across known restaurants, and route-adjacent restaurant ranking.

## MCP tools (8)

The full parameter table, including types and Google-compatible aliases, lives in [`references/tools-api.md`](./references/tools-api.md). Summary:

| Tool | Purpose |
|------|---------|
| `search_restaurants` | Three-tier geo search by `lat`/`lng` or Google-style `locationBias`. |
| `get_restaurant` | Schema.org/Restaurant JSON-LD profile with MP extensions. |
| `get_menu` | Menu Protocol v1.0 menu; only call when `menu_available: true`. |
| `get_ado_score_breakdown` | Heuristic agent-readiness score per restaurant. |
| `validate_menu_protocol` | Validate a Menu Protocol payload before submission. |
| `explore_area_for_diet` | Composite: bucketed `verified`/`menu_indexed`/`discovered` view of a neighborhood. |
| `compare_restaurants_for_diet` | Composite: 2-5 restaurants ranked by dietary-eligible menu items + trust tier. |
| `find_restaurants_along_route` | Composite: route-adjacent restaurants between two coordinates, optional `route_polyline` from your routing source. |

## REST API endpoints

For non-MCP integrations:

| Endpoint | Use |
|----------|-----|
| `GET /api/v1/search` | Three-tier restaurant search. |
| `GET /api/v1/restaurant/{id}` | Restaurant profile with Schema.org JSON-LD + MP extensions. |
| `GET /api/v1/restaurant/{id}/menu.mp` | Full Menu Protocol menu. |

Parameter details for each endpoint and tool live in [`references/tools-api.md`](./references/tools-api.md).

## Agent usage flow

1. **Geocoding:** If the user did not provide coordinates (e.g., they said "near me" or "in Brooklyn"), ask for an address, neighborhood, or ZIP code and convert to latitude/longitude before searching. foodnear.me does **not** call any external routing or geocoding service on the agent's behalf.
2. Call `search_restaurants` (or `/api/v1/search`) with the resolved location and optional filters. Prefer **verified** results for dietary/allergen answers; use **menu_indexed** with caveat when needed.
3. Call `get_menu` only when `menu_available` is true. Discovered-tier rows return `menu_available: false` and must not be cited for menu items.
4. Filter menu items by `dietary.*` flags and check `allergens[]` for safety.
5. Present options to the user or route them to the restaurant's contact/website.

For longer worked examples, see the two recipes in `references/`.

## Claim invitations on non-verified results

Every non-verified result (search row, profile, indexed menu, composite entry) ships with an optional `claim_invitation` object:

```json
"claim_invitation": {
  "url": "https://foodnear.me/claim/<restaurant_id>",
  "audience": "owner_or_advocate",
  "reason": "no_owner_approved_menu" | "indexed_menu_not_owner_verified",
  "message": "<human-readable invitation text the agent may quote verbatim>",
  "estimated_minutes": 5,
  "cost": "free"
}
```

Treat it as **structured data, not a CTA**. Surface it only when relevant — for example:

- The user appears to be the owner of the restaurant or might know them.
- The user asks why a listing lacks a verified menu or what the tiers mean.
- The user asks "how do I get my restaurant on foodnear.me / on AI agents?"

Do **not** unprompt-include the message in routine answers. It is an opt-in helper, not an ad.

## Data trust model (three-tier search)

Search returns **verified** → **menu_indexed** → **discovered** (place only).

Every result includes `verification_status` and `menu_available`:
- **verified** + `menu_available: true` — owner-approved Menu Protocol data with cryptographic signature; authoritative for dietary/allergen claims
- **menu_indexed** + `menu_available: true` — automated/public MP-shaped menu; cite with caveat — not owner-verified
- **discovered** + `menu_available: false` — basic place info from open data; do not cite menu items

Trust progression: `discovered` → `menu_indexed` → `verified`. See https://foodnear.me/attribution for data sources.

## Verifying signatures {#verifying-signatures}

Verified menus carry an Ed25519 signature in `signature`. Two formats are in circulation:

- **fnm-v1** (current): content-bound. The signature binds to a canonical fingerprint of the menu items, so any post-approval edit (price, allergen, dietary flag) invalidates it. Verifier loop:
  1. Read `signature.signature`, `signature.payload_hash`, `signature.signer`, `signature.timestamp`.
  2. Rebuild canonical content from the response items (sort by category/name/price, sort allergen arrays). The `@foodnearme/menu-protocol` package exposes `buildCanonicalMenuContent` + `computeMenuPayloadHash`.
  3. Assert your computed `payload_hash` equals `signature.payload_hash`. If they differ, the menu was edited after signing.
  4. Compute `signing_input = "fnm-v1:" + restaurant_id + ":" + menu_id + ":" + signer + ":" + timestamp + ":" + payload_hash`.
  5. Compute `signed_message = sha256(signing_input)`.
  6. Ed25519 verify `signature.signature` against `signed_message` using the `active_key.public_key_pem` from `/.well-known/menu-signing-keys.json`.

- **fnm-v0** (legacy): proves owner approval at a point in time but does not bind to current contents. Treat content changes since `signature.timestamp` with caution.

The `signing_formats` block in `/.well-known/menu-signing-keys.json` ships machine-readable specs for both formats.

## Response format

All responses are JSON. Restaurant and menu endpoints return Schema.org-compatible JSON-LD.

Menu Protocol responses include:
- `version`: "1.0"
- `domain`: "foodnear.me"
- `restaurant`: Schema.org/Restaurant with MP extensions
- `menu`: Structured menu with categories, items, dietary data, allergens
- `citation` and `attribution`: top-level URLs an agent can cite back when grounding output

## Rate limits

- Public/unauthenticated: 100 requests/minute
- API key holders: higher limits available

## Payment

API access is free during beta. Future paid tiers may use API keys with Stripe metered billing. x402 micropayments are under consideration for machine-to-machine access.

## More information

- OpenAPI spec: `https://foodnear.me/openapi.json`
- Agent metadata: `https://foodnear.me/.well-known/agent.json`
- Menu Protocol spec: `https://github.com/foodnearme/menu-protocol`
- Tool descriptions are mirrored from `apps/web/lib/mcp/server-info.ts` into [`references/tools-api.md`](./references/tools-api.md); CI gate `check:discovery-copy` fails if the two drift.
