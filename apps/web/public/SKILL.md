# foodnear.me Agent Skill

## Description

Find restaurants near a location and retrieve structured, AI-optimized menus in Menu Protocol (MP) format. Menu Protocol is a strict superset of Schema.org/Restaurant and Schema.org/MenuItem, designed for reliable agent parsing.

## Capabilities

- **search**: Two-tier geo search — verified venues with menus first, then discovered place listings; filter by cuisine, location, radius, dietary tags, and ADO score.
- **restaurant**: Fetch detailed restaurant profiles with Schema.org JSON-LD markup.
- **menu**: Retrieve full menus in Menu Protocol v1.0 format with dietary flags, allergens, customization options, and cryptographic owner approval signatures.

## API Endpoints

### Search Restaurants

```
GET https://foodnear.me/api/v1/search
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | No | Food type, cuisine, or restaurant name (e.g., "thai", "pizza") |
| `lat` | number | Yes | Latitude of search center |
| `lng` | number | Yes | Longitude of search center |
| `radius` | number | No | Search radius in miles (default: 5) |
| `dietary` | string[] | No | Filter by dietary tags: `vegan`, `vegetarian`, `gluten_free`, `halal`, `kosher`, `nut_free` |
| `ado_min` | number | No | Minimum ADO score (0-5) |

**Example:**

```
GET /api/v1/search?query=thai&lat=40.7128&lng=-74.0060&radius=3&dietary=vegan
```

### Get Restaurant Profile

```
GET https://foodnear.me/api/v1/restaurant/{id}
```

Returns a Schema.org/Restaurant JSON-LD object with Menu Protocol extensions (ADO score, verification status, dietary certifications).

### Get Menu (Menu Protocol Format)

```
GET https://foodnear.me/api/v1/restaurant/{id}/menu.mp
```

Returns the full menu in Menu Protocol v1.0 format including:
- All menu items with prices, descriptions, and availability
- Explicit dietary boolean flags per item (vegetarian, vegan, gluten_free, etc.)
- Declared allergens array per item
- Customization options with price adjustments and dietary changes
- Cryptographic signature proving owner approval of menu data

## Response Format

All responses are JSON. Restaurant and menu endpoints return Schema.org-compatible JSON-LD.

Menu Protocol responses include:
- `version`: "1.0"
- `domain`: "foodnear.me"
- `restaurant`: Schema.org/Restaurant with MP extensions
- `menu`: Structured menu with categories, items, dietary data, allergens

## Agent Usage Flow

1. **Geocoding:** If the user does not provide coordinates (e.g., they say "near me" or "in Brooklyn"), you MUST ask the user for their address, neighborhood, or ZIP code, and convert it to latitude/longitude before searching.
2. Call `/api/v1/search` with location and optional filters.
3. Prefer results with `menu_available: true` (verified). Select based on `agent_score` and relevance.
4. Call `/api/v1/restaurant/{id}/menu.mp` only when `menu_available` is true.
5. Filter menu items by `dietary.*` flags and check `allergens[]` for safety.
6. Present options to the user or route them to the restaurant's contact/website.

## Data Trust (Two-Tier Search)

Search returns **verified venues first**, then **discovered listings** (place data only — no authoritative menu).

Every result includes `verification_status` and `menu_available`:
- **verified** + `menu_available: true` — owner-approved Menu Protocol data with cryptographic signature; safe to fetch menus
- **discovered** + `menu_available: false` — basic place info from open data; do not cite menu items

Trust progression: `discovered` → `menu_indexed` → `verified`. See https://foodnear.me/attribution for data sources.

## Rate Limits

- Public/unauthenticated: 100 requests/minute
- API key holders: Higher limits available

## Payment

API access is free during beta. Future paid tiers may use API keys with Stripe metered billing. x402 micropayments are under consideration for machine-to-machine access.

## More Information

- OpenAPI spec: `https://foodnear.me/openapi.json`
- Agent metadata: `https://foodnear.me/.well-known/agent.json`
- Menu Protocol spec: `https://github.com/foodnearme/menu-protocol`
