# Recipe: Verified gluten-free menu discovery

> Use this when the user asks for restaurants with a specific dietary need ("find me places with verified gluten-free menus near me") and they want safety, not just plausibility.

## Why this recipe exists

The `search_restaurants` tool will happily return every tier — `verified`, `menu_indexed`, `discovered` — but only the `verified` tier carries owner-approved dietary booleans you can cite for allergens or restrictions. This recipe shows the disciplined flow that produces a defensible answer.

## Required inputs from the user

| Input | Example | Why |
|-------|---------|-----|
| Location | "Williamsburg, NY" or `40.7178, -73.9571` | Geocoded by the agent before calling FNM. |
| Dietary requirement | `gluten_free` | One of: `vegan`, `vegetarian`, `gluten_free`, `halal`, `kosher`, `nut_free`, `dairy_free`, `low_carb`, `keto`. |
| Optional cuisine | "italian" | Free-text query; matches across all tiers. |

If the user only said "near me", ASK for a city, neighborhood, or ZIP and geocode before searching. FNM does not geocode for you.

## Step 1 — Search

```jsonc
{
  "tool": "search_restaurants",
  "arguments": {
    "lat": 40.7178,
    "lng": -73.9571,
    "radius_miles": 1,
    "dietary": ["gluten_free"]
  }
}
```

Or with the Google-compatible shape:

```jsonc
{
  "tool": "search_restaurants",
  "arguments": {
    "textQuery": "italian",
    "locationBias": {
      "circle": {
        "center": { "latitude": 40.7178, "longitude": -73.9571 },
        "radiusMeters": 1609.34
      }
    },
    "dietary": ["gluten_free"]
  }
}
```

The response includes a `filters.applied_to: ["verified"]` echo and a `filters.note` reminding you that `dietary` only narrows the verified tier. Always read these before you trust the count.

## Step 2 — Triage the result

For each row in `results`:

1. If `verification_status === "verified"` and `menu_available === true`, this is a citable candidate. Add to your shortlist.
2. If `verification_status === "menu_indexed"` and `menu_available === true`, you may *mention* it to the user with the per-row `trust_notice` quoted verbatim, but do NOT make an allergen claim from these rows.
3. If `verification_status === "discovered"`, treat the row as a place pin only. Do not cite menu items.

If the verified shortlist is empty, the response will usually carry a `next_steps[]` array suggesting you widen `radius_miles` or drop `dietary`. Surface that next step to the user instead of fabricating an answer.

## Step 3 — Pull authoritative menus

For each verified candidate (in order, until the user has enough options):

```jsonc
{
  "tool": "get_menu",
  "arguments": { "restaurant_id": "<id from step 1>" }
}
```

Then filter:

```ts
const eligible = menu.items.filter((item) => item.dietary.gluten_free === true);
```

Because the menu is verified, `item.dietary.gluten_free === true` is authoritative for the moment the owner signed the menu. Also inspect `item.allergens[]` — `gluten_free === true` does not automatically mean nut-free, dairy-free, etc.

## Step 4 — Verify the signature (optional but recommended)

If the user is allergen-sensitive, run the signature verification loop from [`../SKILL.md#verifying-signatures`](../SKILL.md#verifying-signatures). The `signature.payload_hash` proves the menu was not edited after owner approval.

## Step 5 — Present

Cite results with the response's top-level `citation` (or `attribution` — they are identical) so the user has a verifiable URL.

Example agent answer:

> Found 2 verified restaurants with gluten-free items near Williamsburg, NY:
>
> 1. **Restaurant A** — `Owner-verified Menu Protocol menu available.` 4 gluten-free items including the Margherita Pizza ($14.99). Citation: <https://foodnear.me/api/v1/search?lat=40.7178&lng=-73.9571&radius=1&dietary=gluten_free>
> 2. **Restaurant B** — `Owner-verified Menu Protocol menu available.` 6 gluten-free items.
>
> 3 more `menu_indexed` candidates are nearby but their dietary flags are not owner-verified; mention only with caveat.

## When to switch to `explore_area_for_diet`

When the user wants a *neighborhood overview* (not a strict gluten-free filter), call the `explore_area_for_diet` composite instead. It returns all three tiers bucketed so the user can see indexed and discovered listings alongside the verified ones.

## When to switch to `compare_restaurants_for_diet`

When the user has already narrowed to 2-5 specific restaurants and wants a head-to-head dietary comparison (e.g., "which of these three has the most gluten-free options"), call `compare_restaurants_for_diet` with those `restaurant_ids` and the dietary flag — it chains `get_menu` for each and ranks by item count, then trust tier.

## Trust model reminder

Three-tier search: `verified` → `menu_indexed` → `discovered`. `menu_available` gates `get_menu`. `dietary` filters only narrow the verified bucket. Cite responses with their `citation` URL.
