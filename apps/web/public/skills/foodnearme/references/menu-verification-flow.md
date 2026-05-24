# Recipe: Validate your own restaurant's menu

> Use this when a restaurant owner, operator, or their developer agent wants to check a Menu Protocol payload **before** submitting it to FNM. The flow is owner-facing and read-only — it never writes to the FNM database.

## When to reach for this recipe

- The owner is preparing a Menu Protocol v1.0 export for the first time.
- A POS or website integration generates Menu Protocol payloads programmatically and you want CI-style validation.
- You suspect a previously verified menu has drifted (e.g., prices changed, dietary flags were re-assigned) and you want to spot what would break strict validation before re-signing.

## Required inputs

| Input | Type | Source |
|-------|------|--------|
| `payload` | JSON object | The Menu Protocol payload. Should include at least `version`, `domain`, `restaurant`, and `menu`. |
| `strict` | boolean | `true` when checking formal spec compliance; `false` for exploratory debugging. |

The payload is **not** stored. `validate_menu_protocol` is pure validation; the owner-approval signing path is a separate flow.

## Step 1 — Lenient validation (default)

```jsonc
{
  "tool": "validate_menu_protocol",
  "arguments": {
    "payload": { "version": "1.0", "domain": "foodnear.me", "restaurant": { /* ... */ }, "menu": { /* ... */ } }
  }
}
```

Read:

- `valid` — `true` if the payload is usable for an owner-facing draft (lenient mode tolerates non-critical schema gaps).
- `errors[]` — MUST be empty before submission. These are hard rejections.
- `warnings[]` — strongly recommended to clear, especially items prefixed `schema:`. Each warning includes the JSON pointer of the offending field.
- `schema_strict_valid` — `false` here is a heads-up that strict mode would reject. Use this to decide whether to fix now or after launch.
- `recommendations[]` — agent-readable hints for improving ADO score (see `get_ado_score_breakdown` for the live score).

## Step 2 — Fix and re-run

Loop until `errors` is empty and `warnings` is acceptable. Common fixes:

- Missing `restaurant.slug` or `menu.last_updated` → add them; they unlock several citation surfaces.
- Items without `category_id` → set the field; categories must be referenced explicitly.
- Allergens declared as `null` instead of `[]` → use empty array.
- Dietary flag set as truthy string instead of boolean → coerce to `true` / `false`.

## Step 3 — Strict validation

Once lenient passes cleanly, re-run with `strict: true`:

```jsonc
{
  "tool": "validate_menu_protocol",
  "arguments": {
    "payload": { /* same payload */ },
    "strict": true
  }
}
```

Strict mode promotes the lenient warnings to errors. Read `valid`, `errors[]`, and `strict_mode: true`. Everything still flagged here would fail spec-strict consumers — including future verification audits.

## Step 4 — Decide what to do with the result

| Result | Next step |
|--------|-----------|
| `valid === true`, strict `valid === true` | Submit / publish. Sign with the owner's Ed25519 key per [`../SKILL.md#verifying-signatures`](../SKILL.md#verifying-signatures). |
| Lenient `valid === true`, strict `valid === false` | Acceptable for a draft, but document the deferred warnings in your changelog. |
| Lenient `valid === false` | Do not submit. Fix every error first. |

## Step 5 — Re-check ADO impact

After validation, call `get_ado_score_breakdown` against the existing record (if one exists) to see how the validated payload would shift the agent-readiness score:

```jsonc
{
  "tool": "get_ado_score_breakdown",
  "arguments": { "restaurant_id": "<restaurant uuid>" }
}
```

`scoring_info.scoring_method` returns `heuristic_v1` — treat sub-scores as guidance, not audited facts. Only `total_score` reflects the live `agent_score` column once the menu lands.

## What this recipe does NOT do

- It does not write to the FNM database. Validation is read-only.
- It does not sign the menu. Signing happens client-side with the owner's Ed25519 key.
- It does not verify an existing signature on a *fetched* menu — that is the verifier loop in [`../SKILL.md#verifying-signatures`](../SKILL.md#verifying-signatures).
- It does not change the restaurant's tier from `discovered` → `menu_indexed` → `verified` — that path runs through the operator onboarding flow, not this tool.

## Trust model reminder

This recipe is owner-facing; the three-tier trust model still applies once the menu lands: it will be served back as `verified` (with `menu_available: true`) and downstream consumers will distinguish it from `menu_indexed` and `discovered` rows. Validation today is what makes that trust tier earnable.

## See also

- [`../SKILL.md`](../SKILL.md) — full agent skill (covers signature verification anchor `#verifying-signatures`).
- [`./tools-api.md`](./tools-api.md) — full parameter table for `validate_menu_protocol`.
- [`./dietary-search.md`](./dietary-search.md) — the consumer-side companion recipe.
