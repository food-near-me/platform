/**
 * `validate_menu_protocol` MCP tool.
 *
 * Single source of truth for "does this payload conform to the spec" is the
 * canonical Zod schema in `@foodnearme/menu-protocol`. This tool runs that
 * schema once, then applies a small set of presentation layers on top:
 *
 *  1. **Policy split.** Zod issues are classified by `classifyMenuProtocolIssues`
 *     into "lenient-fatal" (must gate validity even in lenient mode — version,
 *     restaurant.id/name/@type, menu.id/restaurant_id, items array shape, item
 *     names) and "schema-strict-only" (everything else). The policy lives in
 *     the package, not here, so the rules stay testable.
 *
 *  2. **Aggregation.** Per-item issues (`menu.items.N.X`) are grouped by their
 *     leaf field so an agent sees "5 item(s) have schema issues on `dietary`"
 *     instead of 5 separate lines.
 *
 *  3. **Layer C — informational complement.** A small set of checks that the
 *     Zod schema doesn't enforce: item `price`/`offers.price` presence,
 *     signature recommendation, Schema.org best practices. These are
 *     **non-duplicative** with Zod by construction — they exist precisely
 *     because the canonical schema is intentionally silent on them.
 *
 * In default mode, schema-strict-only issues are warnings. In `strict: true`
 * mode, they are promoted to errors and `valid` reflects strict spec
 * compliance.
 *
 * No I/O. Synchronous. Pure function over `args`.
 */

import {
  classifyMenuProtocolIssues,
  validateMenuProtocolPayload,
  type MenuProtocolIssue,
} from "@foodnearme/menu-protocol";

import { buildValidateCitation, citationFields } from "@/lib/mcp/citations";
import type { ValidateMenuProtocolInput } from "./inputs";

/** Maximum number of non-aggregated Zod issues to surface per response. */
const MAX_INDIVIDUAL_ISSUES_SURFACED = 25;
/** Maximum number of items to scan for the Layer C price/offers check. */
const MAX_ITEMS_SCANNED_FOR_PRICE = 20;

const PER_ITEM_PATTERN = /^menu\.items\.(\d+)\.(.+)$/;

/**
 * Per-item-leaf-field aggregation. Issues whose path looks like
 * `menu.items.N.X` are collapsed into a single "N item(s) have schema
 * issues on `X`" line. Non-item issues pass through unchanged.
 *
 * A small set of leaf fields gets an additional human hint (allergens are
 * safety-critical, dietary gates filtering, etc.) so the aggregated message
 * is actionable for an LLM consumer.
 */
const ITEM_FIELD_HINTS: Record<string, string> = {
  dietary: " — required for dietary filtering",
  allergens: " — critical for safety",
  name: " — required",
  "@type": ' — should be "MenuItem" for Schema.org compliance',
  category_id: " — required to link back to menu.categories[]",
};

function aggregateIssues(issues: MenuProtocolIssue[]): {
  aggregated: string[];
  residue: MenuProtocolIssue[];
} {
  const groups = new Map<string, Set<number>>();
  const residue: MenuProtocolIssue[] = [];

  for (const issue of issues) {
    const match = PER_ITEM_PATTERN.exec(issue.path);
    if (!match) {
      residue.push(issue);
      continue;
    }
    const leaf = match[2];
    const index = Number.parseInt(match[1], 10);
    if (!groups.has(leaf)) groups.set(leaf, new Set());
    groups.get(leaf)!.add(index);
  }

  const aggregated = [...groups.entries()]
    .map(([leaf, indices]) => {
      const hint = ITEM_FIELD_HINTS[leaf] ?? "";
      return `${indices.size} item(s) have schema issues on \`${leaf}\`${hint}`;
    })
    // Stable sort by message so output is deterministic across runs.
    .sort();

  return { aggregated, residue };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getMenuItems(data: Record<string, unknown>): Array<Record<string, unknown>> | null {
  const menu = asRecord(data.menu);
  if (!menu) return null;
  const items = menu.items;
  if (!Array.isArray(items)) return null;
  return items as Array<Record<string, unknown>>;
}

/**
 * Layer C: things the Zod schema intentionally does NOT validate, but which
 * the original hand-rolled validator surfaced as warnings/recommendations.
 * No overlap with Zod by construction.
 */
function collectLayerCWarnings(data: Record<string, unknown>): string[] {
  const warnings: string[] = [];

  // Items missing a price signal entirely. The Zod schema has Schema.org's
  // optional `offers.price`; the original validator also accepted a
  // top-level `price` number. Either is fine; both missing is the warning.
  const items = getMenuItems(data);
  if (items && items.length > 0) {
    let missingPrice = 0;
    for (const item of items.slice(0, MAX_ITEMS_SCANNED_FOR_PRICE)) {
      const topLevelPrice = item.price;
      const offers = asRecord(item.offers);
      const hasTopLevelPrice = typeof topLevelPrice === "number";
      const hasOffersPrice = offers !== null && typeof offers.price === "number";
      if (!hasTopLevelPrice && !hasOffersPrice) missingPrice++;
    }
    if (missingPrice > 0) {
      warnings.push(
        `${missingPrice} item(s) missing price (no top-level \`price\` or \`offers.price\`) — required for agent recommendations`,
      );
    }
  }

  return warnings;
}

function collectLayerCRecommendations(
  data: Record<string, unknown>,
  strict: boolean,
): string[] {
  const recommendations: string[] = [];

  if (!data.signature) {
    recommendations.push(
      "Add cryptographic signature for owner approval to boost verification score",
    );
  }

  if (strict) {
    const restaurant = asRecord(data.restaurant);
    if (restaurant && !restaurant["@context"]) {
      recommendations.push(
        'Add restaurant["@context"]: "https://schema.org" for full JSON-LD compliance',
      );
    }
    if (restaurant && !restaurant.address) {
      recommendations.push("Add restaurant.address for better location matching");
    }
    if (restaurant && !restaurant.geo) {
      recommendations.push(
        "Add restaurant.geo with latitude/longitude for map integration",
      );
    }
    recommendations.push(
      "Ensure all items have preparation_time for delivery time estimates",
    );
    recommendations.push("Add images array to menu items for visual display");
    recommendations.push("Include customization_options for items with variations");
  }

  return recommendations;
}

export function validateMenuProtocol(input: ValidateMenuProtocolInput) {
  const { payload, strict } = input;
  const data = payload as Record<string, unknown>;

  // Layer 1: canonical structural validation. Single source of truth.
  const schemaResult = validateMenuProtocolPayload(data);
  const { lenientFatal, schemaStrictOnly } = classifyMenuProtocolIssues(
    schemaResult.issues,
  );

  const errors: string[] = [];
  const warnings: string[] = [];

  // Lenient-fatal issues always go to errors, regardless of mode.
  {
    const { aggregated, residue } = aggregateIssues(lenientFatal);
    for (const message of aggregated) errors.push(`schema: ${message}`);
    for (const issue of residue.slice(0, MAX_INDIVIDUAL_ISSUES_SURFACED)) {
      errors.push(`schema: ${issue.path}: ${issue.message}`);
    }
    const overflow = residue.length - Math.min(residue.length, MAX_INDIVIDUAL_ISSUES_SURFACED);
    if (overflow > 0) {
      errors.push(`schema: (+${overflow} additional lenient-fatal issue(s) omitted)`);
    }
  }

  // Schema-strict-only issues land in warnings (default) or errors (strict mode).
  {
    const { aggregated, residue } = aggregateIssues(schemaStrictOnly);
    const bucket = strict ? errors : warnings;
    for (const message of aggregated) bucket.push(`schema: ${message}`);
    for (const issue of residue.slice(0, MAX_INDIVIDUAL_ISSUES_SURFACED)) {
      bucket.push(`schema: ${issue.path}: ${issue.message}`);
    }
    const overflow = residue.length - Math.min(residue.length, MAX_INDIVIDUAL_ISSUES_SURFACED);
    if (overflow > 0) {
      bucket.push(`schema: (+${overflow} additional schema issue(s) omitted)`);
    }
  }

  // Layer C: complementary checks that Zod intentionally doesn't enforce.
  warnings.push(...collectLayerCWarnings(data));
  const recommendations = collectLayerCRecommendations(data, strict);

  const isValid = errors.length === 0;
  const schemaValid = schemaResult.valid;
  const citation = buildValidateCitation();

  return {
    ...citationFields(citation),
    valid: isValid,
    schema_strict_valid: schemaValid,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
    schema_version: "Menu Protocol v1.0",
    strict_mode: strict,
    summary: isValid
      ? `Valid Menu Protocol payload with ${warnings.length} warning(s)`
      : `Invalid: ${errors.length} error(s) must be fixed`,
    next_steps: isValid
      ? schemaValid
        ? ["Submit to foodnear.me for verification", "Get owner signature", "Monitor ADO score"]
        : [
            "Resolve schema warnings to achieve strict spec compliance",
            "Submit to foodnear.me for verification",
            "Get owner signature",
          ]
      : [
          "Fix listed errors",
          "Re-run validation",
          "See https://foodnear.me/skills/foodnearme/references/menu-verification-flow.md for the validate-and-resign recipe",
        ],
  };
}
