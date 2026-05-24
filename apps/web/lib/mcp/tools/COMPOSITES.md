# MCP Composite Tools — Design

**Created:** May 23, 2026
**Roadmap link:** [`engineering-roadmap-2026-05-23.md`](../../../../../../docs/Food%20Near%20Me/engineering-roadmap-2026-05-23.md) Phase 7f.
**Decision source:** [`decision-log.md`](../../../../../../docs/Food%20Near%20Me/decision-log.md) section "May 23, 2026 — Google MCP shape parity and privacy posture".
**Parity reference:** [`mcp-shape-parity-deltas.md`](../../../../../../docs/Food%20Near%20Me/mcp-shape-parity-deltas.md) section 6 "Composite Tool Inventory".

This document specifies the three FNM-unique composite tools before any of them are implemented. Each section below is the contract a follow-up PR implements; commits for those PRs MUST link back to the corresponding section here.

---

## Why composites at all

The five atomic tools (`search_restaurants`, `get_restaurant`, `get_menu`, `get_ado_score_breakdown`, `validate_menu_protocol`) compose any agent workflow today, but they require the agent to:

1. Issue multiple calls to answer a single user question.
2. Re-implement Haversine ranking, tier bucketing, and dietary item filtering on its side.
3. Decide when `get_menu` is safe to call (only when `menu_available: true`).

A well-chosen composite collapses those agent-side concerns into one tool call that **only makes sense because FNM has signed menu data**. The rule is:

> Ship a composite only if the answer is materially better because FNM has menu/trust data that generic place-search MCPs cannot supply.

That rule disqualifies clones of `maps_explore_area`, `maps_plan_route`, or `maps_compare_places` that do not surface tier or menu signals. It keeps Phase 7 focused on the wedge.

---

## Shared utilities

Implement these once in `lib/mcp/tools/composites/shared.ts` (new module) so all three composites stay consistent.

### Haversine distance

```ts
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number;
```

Standard great-circle approximation, no external service. Used for:

- Distance from `user_location` to each restaurant (compare).
- Detour ranking along a route (along-route).

Acceptable approximation for FNM's neighborhood-scale use cases; never claim driving time.

### Dietary item filter

```ts
export function filterItemsByDietary(
  items: MenuItem[],
  dietary: DietaryFilter[],
): MenuItem[];
```

Returns items where **every** requested dietary flag is `true` on the item. AND logic matches the existing `search_restaurants` filter semantics.

### Tier rank helper

Re-use the existing `tierSortRank` from `@/lib/discovery/verification-status`. Order: `verified` (0) → `menu_indexed` (1) → `discovered` (2).

### Menu indexed caution

When a composite surfaces items from a `menu_indexed` restaurant, each item MUST carry the same `caution` string used by `get_menu`:

> Indexed from a public source. Not safe to cite for allergens, dietary restrictions, or final prices; confirm with the restaurant before final action.

Re-use the constant from `lib/mcp/tools/menu.ts`; extract to a shared module if needed.

---

## Tool 1: `compare_restaurants_for_diet`

**Why FNM:** Google and cablate `compare_places` compare ratings, hours, photos. FNM compares **dietary-eligible menu items**. Discovered-tier rows return zero items by design — that asymmetry is the proof FNM is doing something Google cannot.

### v1 → v2 (v2 shipped 2026-05-23)

v1 dropped `user_location` and `distance_meters` because the PostGIS `location` column on `restaurants` is opaque to PostgREST. **v2 reintroduces them via a dedicated Postgres function** — `public.get_restaurant_coordinates(p_ids uuid[])` (migration `database/migrations/20260524_get_restaurant_coordinates.sql`) — that extracts `ST_X` / `ST_Y` for a small UUID batch on demand.

When `user_location` is provided, the composite resolves coordinates in a single `supabase.rpc("get_restaurant_coordinates", ...)` call before iterating the restaurant ids, then computes Haversine distance per row via `haversineMeters` from `lib/mcp/tools/composites/shared.ts`. Restaurants with a `NULL` `location` are silently absent from the resolved map; the composite surfaces this on those rows with `note: "distance_not_available: restaurant has no geocoded location in our index."` plus a top-level `next_steps` line counting how many rows are affected.

Ranking: `item_count` desc → tier rank → `distance_meters` asc (only when both rows have a numeric distance; rows without distance remain in their pre-sort order).

The composite still respects the "no new database round-trips per-restaurant" rule: distance resolution is a single batched RPC for all 2-5 ids, not N round-trips.

### Input schema

```ts
export const compareRestaurantsForDietInputSchema = z.object({
  restaurant_ids: z
    .array(z.string().uuid({ message: "restaurant_ids[] must be UUIDs" }))
    .min(2, { message: "Provide at least 2 restaurant_ids to compare" })
    .max(5, { message: "Provide at most 5 restaurant_ids per call" })
    .describe("UUIDs from search_restaurants results. Duplicates are deduped."),
  dietary: z
    .array(z.enum(VALID_DIETARY_FILTERS))
    .min(1, { message: "Provide at least one dietary flag" })
    .describe("Dietary flags applied with AND logic at the item level."),
  user_location: z
    .object({
      latitude: latitudeSchema,
      longitude: longitudeSchema,
    })
    .strict()
    .optional()
    .describe("Optional caller location; enables distance_meters per row."),
}).strict();
```

### Internal chain

```
if user_location:
  coordinates <- supabase.rpc("get_restaurant_coordinates", p_ids: unique_restaurant_ids)
  (single batched RPC; rows with NULL location are absent from the map)
For each unique restaurant_id (max 5, deduped):
  getRestaurant(restaurant_id)
    -> capture tier (verification_status), name, menu_available
  if user_location and coordinates.has(id):
    distance_meters = round(haversineMeters(user_location, coordinates.get(id)))
  if user_location and !coordinates.has(id):
    note += "distance_not_available: restaurant has no geocoded location in our index."
  if menu_available:
    getMenu(restaurant_id)
      -> filterItemsByDietary(menu.items, dietary)
      -> indexed-tier items already carry `caution` from get_menu; do not
         re-stamp.
  else:
    return empty dietary_eligible_items with explanatory note
ResourceNotFoundError per-id -> tier: "not_found", item_count: 0, note;
composite still returns 200.
Rank by item_count desc, then tierSortRank asc, then distance_meters asc
(only when both rows have a numeric distance).
```

No new database round-trips per restaurant beyond what the atomic tools already do; coordinate resolution is a single batched RPC for all 2-5 ids.

### Response shape

```json
{
  "citation": "https://foodnear.me/api/v1/compare?ids=...",
  "attribution": "https://foodnear.me/api/v1/compare?ids=...",
  "dietary": ["vegan"],
  "user_location": { "latitude": 40.7178, "longitude": -73.9571 },
  "restaurants": [
    {
      "id": "uuid",
      "name": "Black Star Bakery & Cafe",
      "tier": "menu_indexed",
      "menu_available": true,
      "dietary_eligible_items": [
        {
          "id": "uuid",
          "name": "Vegan Chocolate Cake",
          "price": 8.5,
          "currency": "USD",
          "dietary": { "vegan": true, "gluten_free": false },
          "allergens": ["soy"],
          "caution": "Indexed from a public source..."
        }
      ],
      "item_count": 5,
      "distance_meters": 134,
      "note": "Indexed menu — dietary fields are best-effort."
    },
    {
      "id": "uuid",
      "name": "Williamsburg Pizza",
      "tier": "discovered",
      "menu_available": false,
      "dietary_eligible_items": [],
      "item_count": 0,
      "distance_meters": 312,
      "note": "Discovered-only — no menu signal. Cannot answer dietary questions from FNM data."
    }
  ],
  "comparison_summary": {
    "ranking": [
      { "restaurant_id": "uuid-A", "item_count": 5, "tier": "menu_indexed" },
      { "restaurant_id": "uuid-B", "item_count": 0, "tier": "discovered" }
    ],
    "best_match": "uuid-A",
    "notes": [
      "Prefer `verified` tier for dietary/allergen answers when available.",
      "`menu_indexed` items carry a caution string; cite with caveat."
    ]
  },
  "next_steps": [
    "Call get_menu directly for any restaurant_id to see full menus."
  ]
}
```

`best_match` is `null` when every restaurant has zero eligible items.

### Failure modes

| Condition | Behavior |
|---|---|
| Fewer than 2 ids | `ValidationError` from the Zod schema |
| More than 5 ids | `ValidationError` from the Zod schema |
| Duplicate ids | Dedupe silently; do not error |
| Non-UUID id | `ValidationError` from the Zod schema |
| One id not found | Per-restaurant entry with `tier: "not_found"`, `item_count: 0`, and an explanatory `note` — the composite as a whole still returns 200 |
| All ids not found | Composite returns 200 with `best_match: null` and a `next_steps` entry pointing to `search_restaurants` |
| `getMenu` upstream error for one id | Per-restaurant entry with `item_count: 0`, `note` describing the failure; do not fail the composite |
| Empty dietary array | `ValidationError` |

### Flow test fixture

Add to `lib/mcp/mcp-flow-runner.ts` as `flow-compare-for-diet`. Resolve restaurant IDs at test time by calling `search_restaurants` against `MENU_INDEXED_TEST_LOCATION` and picking:

1. The first `verification_status: "verified"` result (if seeded).
2. The first `verification_status: "menu_indexed"` result.
3. The first `verification_status: "discovered"` result.

Assert:

- `restaurants.length === selected.length`
- Every entry has `dietary_eligible_items` array (possibly empty).
- Discovered-tier entry has `item_count: 0` and a `note` mentioning "no menu signal".
- `ranking` is sorted by `item_count` desc, then by tier rank.
- `citation` and `attribution` match per the 7c helper.

### Description sketch

> Call this tool when comparing 2–5 specific restaurants for items that match a user's dietary requirements. Input Requirements (CRITICAL): `restaurant_ids` MUST be UUIDs from prior FNM responses; `dietary` MUST contain at least one flag. PREFER `verification_status: "verified"` results for authoritative dietary/allergen answers; `menu_indexed` items carry a `caution` field and MUST be cited with caveat; `discovered` entries return zero items by design. Attribute grounded output using `citation` or `attribution`.

---

## Tool 2: `find_restaurants_along_route`

**Why FNM:** Google's `search_places` and cablate's `maps_search_along_route` return generic places. FNM returns places **filtered by dietary signal** and labeled by trust tier. The route geometry itself is not FNM's product, so FNM must not call any external routing service.

### Input schema

```ts
export const findRestaurantsAlongRouteInputSchema = z.object({
  origin: z
    .object({
      latitude: latitudeSchema,
      longitude: longitudeSchema,
    })
    .strict()
    .describe("Route start coordinates."),
  destination: z
    .object({
      latitude: latitudeSchema,
      longitude: longitudeSchema,
    })
    .strict()
    .describe("Route end coordinates."),
  dietary: z
    .array(z.enum(VALID_DIETARY_FILTERS))
    .optional()
    .describe(
      "Optional dietary filter. When set, restaurants are scored by matching items; only verified/menu_indexed restaurants can satisfy this filter.",
    ),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Default 5, max 20."),
  route_polyline: z
    .string()
    .optional()
    .describe(
      "Optional encoded polyline (Google polyline format) computed by the agent's preferred routing source. When omitted, FNM samples a great-circle approximation between origin and destination. FNM never calls an external routing service.",
    ),
}).strict();
```

### Internal chain

```
1. Compute direct_distance_meters = haversineMeters(origin, destination).
2. If direct_distance_meters < 100m: ValidationError ("origin and destination too close").
3. If direct_distance_meters > 200_000m: ValidationError ("route exceeds supported 200 km cap").
4. If route_polyline is provided and parses successfully:
     route_method = "agent_supplied_polyline"
     waypoints = decodePolyline(route_polyline)  // local decoder, no network
   else:
     route_method = "great_circle_approximation"
     waypoints = sampleGreatCircle(origin, destination, N=5)
5. For each waypoint:
     searchRestaurants({ lat, lng, radius_miles: 0.5, dietary? })
     -> collect results into a Map keyed by restaurant_id (dedupes naturally)
6. For each unique restaurant:
     detour_meters = haversineMeters(origin, restaurant.location)
                   + haversineMeters(restaurant.location, destination)
                   - direct_distance_meters
7. If dietary is provided:
     For each verified/menu_indexed restaurant:
       getMenu(restaurant_id)
       dietary_match_count = filterItemsByDietary(menu.items, dietary).length
     Discovered restaurants get dietary_match_count: 0.
8. Rank by:
     a. dietary_match_count desc (only when dietary provided),
     b. tierSortRank asc,
     c. detour_meters asc.
9. Slice to max_results (default 5).
```

Notes:

- Polyline decoding lives in a local helper (`lib/mcp/tools/composites/polyline.ts`). The reference algorithm is short; no dependency required.
- `sampleGreatCircle(origin, destination, N)` returns origin + N intermediate points + destination, evenly spaced by interpolated lat/lng.
- The 0.5-mile radius is intentional: route-adjacent, not neighborhood-wide.
- Searching at multiple waypoints can yield duplicate restaurants. Dedup happens server-side; the agent never sees duplicates.

### Response shape

```json
{
  "citation": "https://foodnear.me/api/v1/along-route?...",
  "attribution": "https://foodnear.me/api/v1/along-route?...",
  "origin": { "latitude": 40.7218, "longitude": -73.9569 },
  "destination": { "latitude": 40.7061, "longitude": -73.9969 },
  "direct_distance_meters": 4214,
  "route_method": "great_circle_approximation",
  "dietary": ["vegan"],
  "max_results": 5,
  "places": [
    {
      "restaurant_id": "uuid",
      "name": "Black Star Bakery & Cafe",
      "tier": "menu_indexed",
      "location": { "lat": 40.7178, "lng": -73.9571 },
      "detour_meters": 312,
      "menu_available": true,
      "dietary_match_count": 3,
      "trust_notice": "Indexed menu from automated/public sources — not owner-verified."
    }
  ],
  "tier_breakdown": { "verified": 0, "menu_indexed": 1, "discovered": 4 },
  "next_steps": [
    "Use the route_polyline param with your routing service for tighter detour ranking.",
    "Call get_menu on a verified or menu_indexed restaurant_id to see full menu items."
  ]
}
```

Omit `dietary_match_count` from results when the input `dietary` was not provided.

### Failure modes

| Condition | Behavior |
|---|---|
| Origin equal to destination | `ValidationError("origin and destination too close")` |
| Direct distance > 200 km | `ValidationError("route exceeds supported 200 km cap")` |
| `route_polyline` malformed | Log a warning, fall back to great-circle approximation, set `route_method: "great_circle_approximation_after_polyline_failed"` |
| `searchRestaurants` empty at every waypoint | Return 200 with `places: []`, `tier_breakdown: { verified: 0, menu_indexed: 0, discovered: 0 }`, and a `next_steps` array suggesting wider geography or no-dietary search |
| `getMenu` error during dietary scoring | Set `dietary_match_count: 0` for that restaurant and continue; do not fail the composite |
| `dietary` provided but all results discovered-only | `next_steps` reminds the agent that dietary cannot be answered from discovered data |

### Flow test fixture

Add `flow-along-route-williamsburg`.

- Origin: `MENU_INDEXED_TEST_LOCATION` (McCarren Park area, `40.7218, -73.9569`).
- Destination: Brooklyn Bridge (`40.7061, -73.9969`).
- No polyline.
- Optional `dietary: ["vegan"]` variant.

Assert:

- `direct_distance_meters` is positive and < 10 km.
- `route_method === "great_circle_approximation"`.
- `places` is an array (possibly empty if Williamsburg seeds are off).
- Every entry has `tier` ∈ `["verified", "menu_indexed", "discovered"]`.
- `tier_breakdown` keys sum to `places.length`.
- `citation` and `attribution` per 7c.

### Description sketch

> Call this tool when the user wants restaurants along a route between two points and may want dietary-eligible options. Input Requirements (CRITICAL): both `origin` and `destination` MUST be `{latitude, longitude}` objects. FNM does not call any external routing service; if you want tighter detour ranking, supply a `route_polyline` from your own routing source (encoded polyline format). When `dietary` is set, results are scored by dietary match count and prefer the `verified` tier. Attribute grounded output using `citation` or `attribution`.

---

## Tool 3: `explore_area_for_diet`

**Why FNM:** Google's `search_places` and cablate's `maps_explore_area` return a flat list. FNM returns a **tier-bucketed** list so an agent can render "verified picks", "indexed candidates", and "place-only listings" in a single response, with `next_steps` when any bucket is empty.

### Input schema

```ts
export const exploreAreaForDietInputSchema = z.object({
  location: z
    .object({
      latitude: latitudeSchema,
      longitude: longitudeSchema,
    })
    .strict()
    .describe("Center of the area to explore."),
  dietary: z
    .array(z.enum(VALID_DIETARY_FILTERS))
    .optional()
    .describe(
      "Optional dietary filter; only applies to the verified tier downstream, matching search_restaurants semantics.",
    ),
  radius_meters: z
    .number()
    .positive()
    .max(MAX_SEARCH_RADIUS_MILES * 1609.34)
    .optional()
    .describe(`Default 1000 m. Max ${MAX_SEARCH_RADIUS_MILES} miles (clamped).`),
  top_n_per_tier: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Default 3, max 10. Trims each tier bucket independently."),
}).strict();
```

### Internal chain

```
1. Convert radius_meters -> radius_miles for the existing RPC.
2. Call searchRestaurants({ lat, lng, radius_miles, dietary }).
3. Bucket results by verification_status.
4. Sort each bucket by distance_meters asc, then by agent_score desc.
5. Trim each bucket to top_n_per_tier (default 3).
6. Compute tier_counts using the full result set (not the trimmed view).
7. Emit next_steps if:
     - Any bucket is empty, OR
     - All buckets are zero, OR
     - dietary was provided and no verified-tier matches landed.
```

No additional database calls beyond `search_restaurants`.

### Response shape

```json
{
  "citation": "https://foodnear.me/api/v1/explore?...",
  "attribution": "https://foodnear.me/api/v1/explore?...",
  "location": { "latitude": 40.7178, "longitude": -73.9571 },
  "radius_meters": 1500,
  "dietary": ["vegan"],
  "top_n_per_tier": 3,
  "tiers": {
    "verified": [],
    "menu_indexed": [
      {
        "id": "uuid",
        "name": "Black Star Bakery & Cafe",
        "distance_meters": 134,
        "tier": "menu_indexed",
        "menu_available": true,
        "agent_score": 3.6,
        "trust_notice": "Indexed menu from automated/public sources — not owner-verified."
      }
    ],
    "discovered": [
      {
        "id": "uuid",
        "name": "Local Spot",
        "distance_meters": 412,
        "tier": "discovered",
        "menu_available": false,
        "agent_score": 2.4,
        "trust_notice": "Discovered listing only..."
      }
    ]
  },
  "tier_counts": {
    "verified": 0,
    "menu_indexed": 4,
    "discovered": 19,
    "total": 23
  },
  "next_steps": [
    "No verified-tier matches for dietary=[vegan]; dietary filters only apply to verified results.",
    "Drop the dietary filter to explore menu_indexed candidates by rating.",
    "Use search_restaurants directly for paginated results beyond top_n_per_tier."
  ]
}
```

### Failure modes

| Condition | Behavior |
|---|---|
| `radius_meters > MAX_SEARCH_RADIUS_MILES * 1609.34` | Clamp silently to the max; matches existing `searchRestaurants` behavior |
| Empty result set | Return 200 with all three tier arrays empty, `tier_counts.total: 0`, and an actionable `next_steps[]` |
| `dietary` provided but no verified-tier hits | Tier buckets reflect reality; `next_steps[]` calls this out |
| Database error from `searchRestaurants` | Bubble the existing `UPSTREAM` tool error (no custom handling needed) |

### Flow test fixture

Add `flow-explore-area-williamsburg`.

- `location: MENU_INDEXED_TEST_LOCATION`.
- `radius_meters: 1500`.
- `dietary: ["vegan"]`.

Assert:

- `tiers.verified`, `tiers.menu_indexed`, `tiers.discovered` are all arrays.
- `tier_counts.total === verified + menu_indexed + discovered`.
- Each entry in each bucket has `distance_meters` and `trust_notice`.
- `next_steps[]` is present when any bucket is empty.
- `citation` and `attribution` per 7c.

### Description sketch

> Call this tool when the user wants a neighborhood overview that surfaces trust tiers explicitly. Input Requirements (CRITICAL): `location` MUST be `{latitude, longitude}`. Returns three tier buckets — `verified`, `menu_indexed`, `discovered` — each trimmed to `top_n_per_tier` (default 3). When `dietary` is set, the filter only narrows the `verified` bucket, matching `search_restaurants` semantics; `next_steps` flags any empty bucket. Attribute grounded output using `citation` or `attribution`.

---

## Cross-cutting concerns

Every composite implementation PR MUST:

1. **Wire up via the same machinery as the five atomic tools:**
   - Zod input schema lives in `lib/mcp/tools/inputs.ts` alongside existing schemas.
   - Tool implementation lives in `lib/mcp/tools/<tool>.ts`.
   - Dispatch entry added to `TOOL_DISPATCH` in `lib/mcp/rpc.ts`.
   - Tool description added to `TOOL_DESCRIPTIONS` in `lib/mcp/server-info.ts`, satisfying the `check:mcp-descriptions` guard (call timing, `Input Requirements (CRITICAL)`, MUST/PREFER/SHOULD directive, citation/attribution mention).
   - Annotations are inherited automatically via `READ_ONLY_ANNOTATIONS` (no per-tool customization needed; all three composites are read-only with non-deterministic results).
   - `EXPECTED_MCP_TOOLS` in `mcp-flow-runner.ts` extended.
   - `.well-known/mcp-server.json` and `openapi.json` updated.
   - `FNM_MCP_ENABLED_TOOLS` allowlist still works (no code change required because the new tools register through the same path).

2. **Use the shared citation helper** so `attribution` is automatic:

   ```ts
   import { citationFields } from "@/lib/mcp/citations";
   return { ...citationFields(citation), /* ... */ };
   ```

   Add a builder for each new endpoint in `citations.ts` (`buildCompareCitation`, `buildAlongRouteCitation`, `buildExploreCitation`).

3. **Honor parity with `search_restaurants` aliases.** Composites that take coordinates SHOULD accept Google-style nested forms via a thin reuse of the existing normalizer, not by re-implementing it. If union/transform-based schemas (like `searchRestaurantsInputSchema`) become unwieldy, factor the normalizer into a helper before duplicating.

4. **Avoid Google services entirely.** No fetches to `mapstools.googleapis.com`, `maps.googleapis.com`, or any Google API endpoint. Local Haversine and local polyline decoding only.

5. **Instrument.** `scheduleRecordMcpInvocation` already runs for any tool dispatched through `rpc.ts`; verify that `extractTierLabel` and `extractResultsCount` cope with the new response shapes, or extend them.

6. **Trust language reuse.** Use `buildSearchTrustNotice`, `buildProfileTrustNotice`, and the indexed menu `caution` constant. Do not invent new wording.

7. **Per-restaurant errors are local, not global.** A composite call that touches multiple restaurants MUST NOT fail wholesale because one sub-call failed; emit a per-restaurant `note` and continue.

8. **No write paths.** All composites are read-only. The `readOnlyHint: true` annotation must remain accurate.

---

## Acceptance criteria per PR

Each composite ships in its own PR with the following gate:

- New input schema in `lib/mcp/tools/inputs.ts`, type exported.
- New tool file under `lib/mcp/tools/`.
- Dispatch + description + annotation wired through `server-info.ts` and `rpc.ts`.
- New flow test in `lib/mcp/mcp-flow-runner.ts`; `EXPECTED_MCP_TOOLS` updated.
- `npm run check:mcp-descriptions` passes.
- `npm run typecheck` and `npm run lint` clean.
- `npm run test:mcp-tool-filtering` still passes (filtering must work on the new tool name).
- `.well-known/mcp-server.json`, `openapi.json`, and the `EXPECTED_MCP_TOOLS` discovery copy parity updated together.
- README composite table updated.
- Commit body cites this doc by anchor (`COMPOSITES.md#tool-N-...`).

## Sequencing recommendation

Ship in this order to keep blast radius low:

1. `explore_area_for_diet` first — pure decoration on top of `searchRestaurants`, no new geometry math.
2. `compare_restaurants_for_diet` next — adds per-restaurant menu fetches and ranking, but no route geometry.
3. `find_restaurants_along_route` last — introduces polyline decoding and great-circle sampling, which is the most novel piece of logic and the easiest to get subtly wrong.

If any of the three composites stop earning the "menu/trust data makes the answer better" test during implementation, cancel that one rather than shipping a generic place-search clone.
