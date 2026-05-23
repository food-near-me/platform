/**
 * Zod input schemas for every MCP tool.
 *
 * One module owns the schemas so the tool catalogue in `server-info.ts` can
 * generate JSON Schemas from them via `zod-to-json-schema` while each tool
 * handler in `lib/mcp/tools/*` consumes the inferred TypeScript types
 * directly — no more `Record<string, unknown>` arg lists, no more drift
 * between the documented schema and the runtime validator.
 *
 * Conventions:
 * - Pure structural validation lives in Zod (types, ranges, enums, UUIDs).
 * - Domain-style coercion (clamping a radius below the max) lives in the
 *   tool handler so agents get forgiving inputs for benign mistakes but
 *   hard rejections for nonsensical ones (lat=999).
 * - Every `.min/.max` carries a custom message so the dispatcher can
 *   forward a single human-readable line to the caller instead of Zod's
 *   default `Number must be greater than or equal to -90`.
 * - Field-level `.describe()` calls produce the JSON Schema `description`
 *   that agents see in `tools/list`.
 */

import { z } from "zod";

import { MAX_SEARCH_RADIUS_MILES, VALID_DIETARY_FILTERS } from "@/lib/mcp/constants";

const dietaryEnum = z.enum(VALID_DIETARY_FILTERS);

const restaurantIdSchema = z
  .string({
    required_error: "restaurant_id is required",
    invalid_type_error: "restaurant_id must be a string",
  })
  .uuid({ message: "restaurant_id must be a valid UUID" })
  .describe("Restaurant UUID (from search_restaurants results)");

export const searchRestaurantsInputSchema = z
  .object({
    query: z
      .string()
      .optional()
      .describe(
        "Food type, cuisine, or restaurant name. Examples: 'thai', 'pizza', 'sushi', 'vegan burgers'. Leave empty to search all cuisines.",
      ),
    lat: z
      .number({
        required_error: "lat is required",
        invalid_type_error: "lat must be a number",
      })
      .min(-90, { message: "lat must be between -90 and 90" })
      .max(90, { message: "lat must be between -90 and 90" })
      .describe("Latitude of search center (-90 to 90)"),
    lng: z
      .number({
        required_error: "lng is required",
        invalid_type_error: "lng must be a number",
      })
      .min(-180, { message: "lng must be between -180 and 180" })
      .max(180, { message: "lng must be between -180 and 180" })
      .describe("Longitude of search center (-180 to 180)"),
    radius_miles: z
      .number({ invalid_type_error: "radius_miles must be a number" })
      .optional()
      .describe(
        `Search radius in miles. Default: 5, Max: ${MAX_SEARCH_RADIUS_MILES}. Values outside (0.1, ${MAX_SEARCH_RADIUS_MILES}) are clamped, not rejected.`,
      ),
    dietary: z
      .array(dietaryEnum, {
        invalid_type_error: "dietary must be an array of dietary filter strings",
      })
      .optional()
      .describe(
        "Filter by dietary certifications. Multiple filters use AND logic. Only applies to the verified tier; menu_indexed and discovered rows pass through unfiltered.",
      ),
    min_ado_score: z
      .number({ invalid_type_error: "min_ado_score must be a number" })
      .optional()
      .describe(
        "Minimum ADO score (0.0-5.0). Higher scores indicate better agent-readiness. Only applies to the verified tier. Out-of-range values are clamped.",
      ),
  })
  .strict();

export const getRestaurantInputSchema = z
  .object({
    restaurant_id: restaurantIdSchema,
  })
  .strict();

export const getMenuInputSchema = z
  .object({
    restaurant_id: restaurantIdSchema,
  })
  .strict();

export const getAdoScoreBreakdownInputSchema = z
  .object({
    restaurant_id: restaurantIdSchema.describe("Restaurant UUID"),
  })
  .strict();

export const validateMenuProtocolInputSchema = z
  .object({
    payload: z
      .record(z.unknown(), {
        required_error: "payload is required",
        invalid_type_error: "payload must be a JSON object",
      })
      .describe(
        "The Menu Protocol JSON payload to validate. Should include version, domain, restaurant, and menu objects.",
      ),
    strict: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "If true, schema warnings are promoted to errors and `valid` reflects strict spec compliance. Default: false (lenient mode).",
      ),
  })
  .strict();

export type SearchRestaurantsInput = z.infer<typeof searchRestaurantsInputSchema>;
export type GetRestaurantInput = z.infer<typeof getRestaurantInputSchema>;
export type GetMenuInput = z.infer<typeof getMenuInputSchema>;
export type GetAdoScoreBreakdownInput = z.infer<typeof getAdoScoreBreakdownInputSchema>;
export type ValidateMenuProtocolInput = z.infer<typeof validateMenuProtocolInputSchema>;

/**
 * Master registry of (toolName -> Zod schema). The dispatcher in
 * `lib/mcp/rpc.ts` uses this to validate args, and `server-info.ts` uses it
 * to derive the JSON Schemas exposed in `tools/list`.
 *
 * Kept in this file (rather than each tool exporting its own) so the
 * authoritative shape of every tool's input is visible in a single place
 * and so an out-of-sync tool name is a compile error instead of a runtime
 * "Unknown tool" surprise.
 */
export const TOOL_INPUT_SCHEMAS = {
  search_restaurants: searchRestaurantsInputSchema,
  get_restaurant: getRestaurantInputSchema,
  get_menu: getMenuInputSchema,
  get_ado_score_breakdown: getAdoScoreBreakdownInputSchema,
  validate_menu_protocol: validateMenuProtocolInputSchema,
} as const;

export type ToolName = keyof typeof TOOL_INPUT_SCHEMAS;
