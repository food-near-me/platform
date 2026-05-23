/**
 * `validate_menu_protocol` MCP tool.
 *
 * Synchronous, no I/O. Walks the payload and reports missing required fields,
 * Schema.org compliance gaps, and ADO-uplifting recommendations.
 *
 * TODO(Phase 2 item 2): replace the hand-rolled walker with a call to
 * `MenuProtocolSchema.safeParse(...)` from `@foodnearme/menu-protocol`.
 * Behaviour preserved verbatim for the split commit so flow tests stay
 * pass-for-pass identical.
 */

import { buildValidateCitation } from "@/lib/mcp/citations";
import { ValidationError } from "@/lib/mcp/errors";

export function validateMenuProtocol(args: Record<string, unknown>) {
  const payload = args.payload;
  const strict = args.strict === true;

  if (!payload || typeof payload !== "object") {
    throw new ValidationError(
      "payload must be a JSON object",
      "Pass a Menu Protocol v1.0 object with version, restaurant, and menu fields.",
    );
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  const data = payload as Record<string, unknown>;

  if (data.version !== "1.0") {
    errors.push('Missing or invalid "version" field. Expected: "1.0"');
  }
  if (data.domain !== "foodnear.me") {
    warnings.push('Non-standard "domain" field. Expected: "foodnear.me" for hosted endpoints');
  }

  const restaurant = data.restaurant as Record<string, unknown> | undefined;
  if (!restaurant || typeof restaurant !== "object") {
    errors.push('Missing required "restaurant" object');
  } else {
    if (!restaurant.name || typeof restaurant.name !== "string") {
      errors.push("restaurant.name is required (string)");
    }
    if (!restaurant.id || typeof restaurant.id !== "string") {
      errors.push("restaurant.id is required (string)");
    }

    if (restaurant["@type"] !== "Restaurant") {
      warnings.push('restaurant["@type"] should be "Restaurant" for Schema.org compliance');
    }
    if (strict && !restaurant["@context"]) {
      warnings.push(
        'restaurant["@context"] should be "https://schema.org" for full JSON-LD compliance',
      );
    }
    if (strict && !restaurant.address) {
      recommendations.push("Add restaurant.address for better location matching");
    }
    if (strict && !restaurant.geo) {
      recommendations.push("Add restaurant.geo with latitude/longitude for map integration");
    }
  }

  const menu = data.menu as Record<string, unknown> | undefined;
  if (!menu || typeof menu !== "object") {
    errors.push('Missing required "menu" object');
  } else {
    if (!menu.id || typeof menu.id !== "string") {
      errors.push("menu.id is required (string)");
    }
    if (!menu.restaurant_id || typeof menu.restaurant_id !== "string") {
      errors.push("menu.restaurant_id is required (string)");
    }

    const categories = menu.categories;
    if (!Array.isArray(categories)) {
      errors.push("menu.categories must be an array");
    } else if (categories.length === 0) {
      warnings.push("menu.categories is empty — add at least one category");
    }

    const items = menu.items as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(items)) {
      errors.push("menu.items must be an array");
    } else if (items.length === 0) {
      warnings.push("menu.items is empty — add menu items");
    } else {
      let itemsWithoutDietary = 0;
      let itemsWithoutAllergens = 0;
      let itemsWithoutPrice = 0;

      for (const item of items.slice(0, 20)) {
        if (!item.name) errors.push(`Item missing required "name" field`);
        if (!item.dietary || typeof item.dietary !== "object") itemsWithoutDietary++;
        if (!Array.isArray(item.allergens)) itemsWithoutAllergens++;
        if (typeof item.price !== "number" && !item.offers) itemsWithoutPrice++;
      }

      if (itemsWithoutDietary > 0) {
        warnings.push(
          `${itemsWithoutDietary} item(s) missing dietary flags — required for dietary filtering`,
        );
      }
      if (itemsWithoutAllergens > 0) {
        warnings.push(
          `${itemsWithoutAllergens} item(s) missing allergens array — critical for safety`,
        );
      }
      if (itemsWithoutPrice > 0) {
        warnings.push(
          `${itemsWithoutPrice} item(s) missing price — required for agent recommendations`,
        );
      }
    }
  }

  if (errors.length === 0) {
    if (!data.signature) {
      recommendations.push(
        "Add cryptographic signature for owner approval to boost verification score",
      );
    }
    if (strict) {
      recommendations.push("Ensure all items have preparation_time for delivery time estimates");
      recommendations.push("Add images array to menu items for visual display");
      recommendations.push("Include customization_options for items with variations");
    }
  }

  const isValid = errors.length === 0;

  return {
    citation: buildValidateCitation(),
    valid: isValid,
    errors: errors.length > 0 ? errors : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
    schema_version: "Menu Protocol v1.0",
    strict_mode: strict,
    summary: isValid
      ? `Valid Menu Protocol payload with ${warnings.length} warning(s)`
      : `Invalid: ${errors.length} error(s) must be fixed`,
    next_steps: isValid
      ? ["Submit to foodnear.me for verification", "Get owner signature", "Monitor ADO score"]
      : ["Fix listed errors", "Re-run validation", "See https://foodnear.me/SKILL.md for spec"],
  };
}
