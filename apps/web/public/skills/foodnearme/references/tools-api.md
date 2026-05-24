# foodnear.me MCP Tools — Parameter Reference

> Mirrored from `apps/web/lib/mcp/server-info.ts` and `apps/web/lib/mcp/tools/inputs.ts`. CI gate `check:discovery-copy` fails if a tool name from `ALL_TOOLS` is missing from this file. The list below is canonical for the 8 tools FNM ships.
>
> Tooling rules every tool obeys:
> - All tools are read-only (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: false`).
> - Every response carries top-level `citation` and `attribution` URLs an agent can ground answers with.
> - Discovered-tier restaurants never expose menu items. Composite tools that touch menus enforce this internally.
> - Non-verified results carry a structured `claim_invitation` object (`url`, `audience: "owner_or_advocate"`, `reason`, `message`, `estimated_minutes`, `cost: "free"`). It is owner-recruitment data the agent SHOULD surface contextually, not an unconditional CTA. Verified results omit the field. See `../SKILL.md#claim-invitations-on-non-verified-results`.

---

## `search_restaurants`

Three-tier geo search. The primary discovery tool.

**Input modes:**

- **Flat (FNM-native):** `lat`, `lng`, optional `radius_miles`, `query`, `dietary`, `min_ado_score`, `languageCode`/`language_code`, `regionCode`/`region_code`.
- **Google `locationBias.circle`:** `locationBias: { circle: { center: { latitude, longitude }, radiusMeters | radius_meters } }`, with optional `textQuery`/`text_query` for the cuisine text.
- **Google `location_bias` (snake_case alias):** same nested shape under `location_bias`.
- **cablate `locationBias`:** `locationBias: { latitude, longitude, radius }`.

All four shapes parse and normalize to the same internal request; `dietary` and `min_ado_score` filters only narrow the verified tier.

**Important fields on each result:**

| Field | Why |
|-------|-----|
| `verification_status` | `verified` / `menu_indexed` / `discovered`. Drives trust label. |
| `menu_available` | MUST be `true` before calling `get_menu`. |
| `distance_meters` | Server-computed haversine distance from search center. |
| `trust_notice` | Pre-formatted tier caveat agents can quote. |
| `links` | `profile`, `menu` (if available), `claim` (otherwise). |

The full Zod schema (with aliases and unions) lives in `apps/web/lib/mcp/tools/inputs.ts` under `searchRestaurantsInputSchema`.

## `get_restaurant`

Schema.org/Restaurant JSON-LD profile with Menu Protocol extensions.

| Input | Type | Notes |
|-------|------|-------|
| `restaurant_id` | UUID | MUST come from a prior FNM result; never invented. |

Returns: `@context`, `@type`, `id`, `name`, `slug`, `address`, `servesCuisine`, `priceRange`, `agent_score`, `verification_status`, `menu_available`, `data_source`, `trust_notice`, `delivery_radius_miles`, `payment_methods`, `dietary_certifications`, `website_url`, `phone`, `health_inspection_grade`, `last_updated`, `links`, plus top-level `citation`/`attribution`.

MUST inspect `menu_available` before calling `get_menu`. If `false`, the `links.claim` URL invites the owner to publish a signed menu.

## `get_menu`

Full Menu Protocol v1.0 payload for a verified or menu_indexed restaurant.

| Input | Type | Notes |
|-------|------|-------|
| `restaurant_id` | UUID | Only valid when `menu_available: true`. Discovered-tier ids return `NOT_FOUND`. |

Returns Menu Protocol v1.0 (`version: "1.0"`, `domain: "foodnear.me"`, `restaurant`, `menu.categories`, `menu.items[]` with full dietary booleans, allergen arrays, customization options, preparation times, signature block, and item-level `caution` on menu_indexed tier). See [`../SKILL.md#verifying-signatures`](../SKILL.md#verifying-signatures) for the signature verification loop.

## `get_ado_score_breakdown`

Heuristic agent-readiness ("Agent Discovery Optimization") score per restaurant.

| Input | Type | Notes |
|-------|------|-------|
| `restaurant_id` | UUID | Any tier accepted; useful for owner-facing review. |

Returns: `total_score`, weighted `breakdown` across menu completeness, location accuracy, freshness, protocol compliance, verification status, and media context; plus `recommendations[]`, `next_steps[]`, and a `scoring_info: { scoring_method: "heuristic_v1", caveat }` block. MUST treat sub-scores as heuristic; only `total_score` reflects the live `agent_score` column.

## `validate_menu_protocol`

Validate a draft or exported Menu Protocol payload before submission.

| Input | Type | Notes |
|-------|------|-------|
| `payload` | JSON object | Menu Protocol payload to validate. |
| `strict` | boolean (default `false`) | When `true`, schema warnings are promoted to errors. |

Returns: `valid`, `errors[]`, `warnings[]`, `schema_strict_valid`, `strict_mode`, `recommendations[]`, plus `schema_version: "Menu Protocol v1.0"` and `citation`/`attribution`.

## `explore_area_for_diet` (composite)

Tier-bucketed neighborhood overview built on top of `search_restaurants`.

| Input | Type | Notes |
|-------|------|-------|
| `location` | `{ latitude, longitude }` | Google-style nested object (required). |
| `dietary` | string[] | Optional. Only narrows the verified bucket. |
| `radius_meters` | number | Default 1000 m. Max ~80 km (clamps). |
| `top_n_per_tier` | int | Default 3, max 10. Each bucket trimmed independently. |

Returns: `tiers: { verified, menu_indexed, discovered }` arrays trimmed to `top_n_per_tier`, plus full `tier_counts: { verified, menu_indexed, discovered, total }`, and `next_steps[]` when any bucket is empty. Every per-tier entry includes `id`, `name`, `tier`, `distance_meters`, `agent_score`, `cuisine_type`, `menu_available`, `trust_notice`, and `links`.

## `compare_restaurants_for_diet` (composite)

Side-by-side dietary comparison for 2-5 known restaurants, optionally with distance ranking.

| Input | Type | Notes |
|-------|------|-------|
| `restaurant_ids` | UUID[] (2-5, deduped) | Must come from prior FNM results. |
| `dietary` | string[] (≥1) | Filters menu items via AND logic. |
| `user_location` | `{ latitude, longitude }` (optional) | When set, each row carries `distance_meters` (great-circle from this point) and distance becomes the final tiebreaker after item count and trust tier. |

Internally chains `get_restaurant` → `get_menu` → dietary filter for each id. When `user_location` is set, a single batched RPC (`get_restaurant_coordinates`) resolves all PostGIS coordinates up-front. Per-restaurant errors are local: a `NOT_FOUND` id becomes `{ tier: "not_found", item_count: 0, note: ... }` while the rest of the comparison still returns. Restaurants with a `NULL` PostGIS location are flagged with `note: "distance_not_available: ..."` and a count of affected rows surfaces in `next_steps`.

Ranking: `item_count` desc → trust tier (verified → menu_indexed → discovered) → `distance_meters` asc (only when both rows have a numeric distance).

Returns: `dietary`, optional echoed `user_location`, `restaurants[]` (each with `id`, `name`, `tier`, `menu_available`, `dietary_eligible_items[]`, `item_count`, optional `distance_meters`, optional `note`), and `comparison_summary: { ranking[], best_match, notes[] }`.

## `find_restaurants_along_route` (composite)

Route-adjacent restaurant discovery between two coordinates. FNM never calls an external routing or geocoding service.

| Input | Type | Notes |
|-------|------|-------|
| `origin` | `{ latitude, longitude }` | Required. |
| `destination` | `{ latitude, longitude }` | Required. |
| `dietary` | string[] | Optional. Triggers dietary-match ranking. |
| `max_results` | int (1-20) | Default 5. |
| `route_polyline` | string | Optional Google encoded polyline from your routing source. |

When `route_polyline` is supplied, it is decoded locally and waypoints are sampled from it. Otherwise FNM samples a great-circle approximation and labels `route_method: "great_circle_approximation"`; an invalid polyline downgrades to `"great_circle_approximation_after_polyline_failed"`. Range guards: `<100 m` and `>200 km` return `VALIDATION_ERROR`.

Returns: `origin`, `destination`, `direct_distance_meters`, `route_method`, optional `dietary`, `max_results`, `places[]` (each with `restaurant_id`, `name`, `tier`, `route_proximity_meters`, `menu_available`, `trust_notice`, optional `dietary_match_count`), and `tier_breakdown` summing to `places.length`. `next_steps[]` includes a polyline upsell when the fallback path is used.

---

## Data trust markers

Every tool above respects the three-tier model: results carry `verification_status` ∈ {`verified`, `menu_indexed`, `discovered`} and `menu_available`. Agents MUST check `menu_available` before calling `get_menu`. See [`../SKILL.md`](../SKILL.md) for the full trust model.
