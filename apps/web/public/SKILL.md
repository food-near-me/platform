# foodnear.me Agent Skill

## Description

Find restaurants near a location and retrieve structured, AI-optimized menus in Menu Protocol (MP) format. Menu Protocol is a strict superset of Schema.org/Restaurant and Schema.org/MenuItem, designed for reliable agent parsing.

## Capabilities

- **search**: Three-tier geo search — verified → menu_indexed → discovered. Cuisine/text and location/radius apply to every tier; **`dietary` and `min_ado_score` filters apply only to the verified tier** (menu_indexed and discovered rows pass through unfiltered for those fields — re-filter at item level via `menu`). The response echoes `filters.applied_to: ["verified"]` and a `filters.note`.
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
| `dietary` | string[] | No | Filter by dietary tags: `vegan`, `vegetarian`, `gluten_free`, `halal`, `kosher`, `nut_free`, `dairy_free`, `low_carb`, `keto` — applied **only to verified tier** |
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
3. Prefer **verified** results for dietary/allergen answers; use **menu_indexed** with caveat when needed.
4. Call `/api/v1/restaurant/{id}/menu.mp` only when `menu_available` is true.
5. Filter menu items by `dietary.*` flags and check `allergens[]` for safety.
6. Present options to the user or route them to the restaurant's contact/website.

## Data Trust (Three-Tier Search)

Search returns **verified** → **menu_indexed** → **discovered** (place only).

Every result includes `verification_status` and `menu_available`:
- **verified** + `menu_available: true` — owner-approved Menu Protocol data with cryptographic signature; authoritative for dietary/allergen claims
- **menu_indexed** + `menu_available: true` — automated/public MP-shaped menu; cite with caveat — not owner-verified
- **discovered** + `menu_available: false` — basic place info from open data; do not cite menu items

Trust progression: `discovered` → `menu_indexed` → `verified`. See https://foodnear.me/attribution for data sources.

## Verifying Signatures

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

## Rate Limits

- Public/unauthenticated: 100 requests/minute
- API key holders: Higher limits available

## Payment

API access is free during beta. Future paid tiers may use API keys with Stripe metered billing. x402 micropayments are under consideration for machine-to-machine access.

## More Information

- OpenAPI spec: `https://foodnear.me/openapi.json`
- Agent metadata: `https://foodnear.me/.well-known/agent.json`
- Menu Protocol spec: `https://github.com/foodnearme/menu-protocol`
