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

const latitudeSchema = z
  .number({
    required_error: "latitude is required",
    invalid_type_error: "latitude must be a number",
  })
  .min(-90, { message: "latitude must be between -90 and 90" })
  .max(90, { message: "latitude must be between -90 and 90" });

const longitudeSchema = z
  .number({
    required_error: "longitude is required",
    invalid_type_error: "longitude must be a number",
  })
  .min(-180, { message: "longitude must be between -180 and 180" })
  .max(180, { message: "longitude must be between -180 and 180" });

const restaurantIdSchema = z
  .string({
    required_error: "restaurant_id is required",
    invalid_type_error: "restaurant_id must be a string",
  })
  .uuid({ message: "restaurant_id must be a valid UUID" })
  .describe("Restaurant UUID (from search_restaurants results)");

const searchCommonFields = {
  query: z
    .string()
    .optional()
    .describe(
      "Food type, cuisine, or restaurant name. Examples: 'thai', 'pizza', 'sushi', 'vegan burgers'. Leave empty to search all cuisines.",
    ),
  textQuery: z
    .string()
    .optional()
    .describe(
      "Google Maps MCP-compatible alias for query. Normalized to query internally.",
    ),
  text_query: z
    .string()
    .optional()
    .describe(
      "Snake_case alias for textQuery, accepted because Google's prose examples use this form.",
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
  languageCode: z
    .string()
    .optional()
    .describe(
      "Google Maps MCP-compatible locale hint (ISO 639-1, optionally with region). Accepted and echoed; FNM is US/English-only in v1.",
    ),
  language_code: z
    .string()
    .optional()
    .describe("Snake_case alias for languageCode."),
  regionCode: z
    .string()
    .optional()
    .describe(
      "Google Maps MCP-compatible CLDR region hint (for example, US). Accepted and echoed; FNM is US/English-only in v1.",
    ),
  region_code: z
    .string()
    .optional()
    .describe("Snake_case alias for regionCode."),
};

const radiusAliasFields = {
  radius_miles: z
    .number({ invalid_type_error: "radius_miles must be a number" })
    .optional()
    .describe(
      `Search radius in miles. Default: 5, Max: ${MAX_SEARCH_RADIUS_MILES}. Values outside (0.1, ${MAX_SEARCH_RADIUS_MILES}) are clamped, not rejected.`,
    ),
  radiusMeters: z
    .number({ invalid_type_error: "radiusMeters must be a number" })
    .optional()
    .describe("Google Maps MCP-compatible search radius in meters."),
  radius_meters: z
    .number({ invalid_type_error: "radius_meters must be a number" })
    .optional()
    .describe("Snake_case alias for radiusMeters."),
};

const latLngSchema = z
  .object({
    latitude: latitudeSchema.describe("Latitude of search center (-90 to 90)"),
    longitude: longitudeSchema.describe("Longitude of search center (-180 to 180)"),
  })
  .strict();

const googleLocationBiasSchema = z
  .object({
    circle: z
      .object({
        center: latLngSchema,
        radiusMeters: z
          .number({ invalid_type_error: "locationBias.circle.radiusMeters must be a number" })
          .optional()
          .describe("Search radius in meters."),
        radius_meters: z
          .number({ invalid_type_error: "location_bias.circle.radius_meters must be a number" })
          .optional()
          .describe("Snake_case alias for radiusMeters."),
      })
      .strict(),
  })
  .strict();

const cablateLocationBiasSchema = z
  .object({
    latitude: latitudeSchema.describe("Latitude of search center (-90 to 90)"),
    longitude: longitudeSchema.describe("Longitude of search center (-180 to 180)"),
    radius: z
      .number({ invalid_type_error: "locationBias.radius must be a number" })
      .optional()
      .describe("cablate/mcp-google-map-compatible radius in meters."),
  })
  .strict();

const searchRestaurantsFlatInputSchema = z
  .object({
    ...searchCommonFields,
    lat: latitudeSchema.describe("Latitude of search center (-90 to 90)"),
    lng: longitudeSchema.describe("Longitude of search center (-180 to 180)"),
    ...radiusAliasFields,
  })
  .strict();

const searchRestaurantsGoogleInputSchema = z
  .object({
    ...searchCommonFields,
    locationBias: googleLocationBiasSchema.describe(
      "Google Maps MCP-compatible location bias. Uses circle.center.latitude/longitude and optional circle.radiusMeters.",
    ),
  })
  .strict();

const searchRestaurantsSnakeGoogleInputSchema = z
  .object({
    ...searchCommonFields,
    location_bias: googleLocationBiasSchema.describe(
      "Snake_case alias for locationBias, accepted because Google's prose examples use this form.",
    ),
  })
  .strict();

const searchRestaurantsCablateInputSchema = z
  .object({
    ...searchCommonFields,
    locationBias: cablateLocationBiasSchema.describe(
      "cablate/mcp-google-map-compatible locationBias with latitude, longitude, and optional radius.",
    ),
  })
  .strict();

function metersToMiles(meters: number | undefined): number | undefined {
  return meters === undefined ? undefined : meters / 1609.34;
}

function normalizeSearchQuery(input: {
  query?: string;
  textQuery?: string;
  text_query?: string;
}): string | undefined {
  return input.query ?? input.textQuery ?? input.text_query;
}

function normalizeLocale(input: {
  languageCode?: string;
  language_code?: string;
  regionCode?: string;
  region_code?: string;
}): { languageCode?: string; regionCode?: string } {
  return {
    languageCode: input.languageCode ?? input.language_code,
    regionCode: input.regionCode ?? input.region_code,
  };
}

export const searchRestaurantsInputSchema = z
  .union([
    searchRestaurantsFlatInputSchema,
    searchRestaurantsGoogleInputSchema,
    searchRestaurantsSnakeGoogleInputSchema,
    searchRestaurantsCablateInputSchema,
  ])
  .transform((input) => {
    const query = normalizeSearchQuery(input);
    const locale = normalizeLocale(input);

    if ("lat" in input) {
      return {
        query,
        lat: input.lat,
        lng: input.lng,
        radius_miles:
          input.radius_miles ?? metersToMiles(input.radiusMeters ?? input.radius_meters),
        dietary: input.dietary,
        min_ado_score: input.min_ado_score,
        ...locale,
      };
    }

    if ("location_bias" in input) {
      const circle = input.location_bias.circle;
      return {
        query,
        lat: circle.center.latitude,
        lng: circle.center.longitude,
        radius_miles: metersToMiles(circle.radiusMeters ?? circle.radius_meters),
        dietary: input.dietary,
        min_ado_score: input.min_ado_score,
        ...locale,
      };
    }

    if ("circle" in input.locationBias) {
      const circle = input.locationBias.circle;
      return {
        query,
        lat: circle.center.latitude,
        lng: circle.center.longitude,
        radius_miles: metersToMiles(circle.radiusMeters ?? circle.radius_meters),
        dietary: input.dietary,
        min_ado_score: input.min_ado_score,
        ...locale,
      };
    }

    return {
      query,
      lat: input.locationBias.latitude,
      lng: input.locationBias.longitude,
      radius_miles: metersToMiles(input.locationBias.radius),
      dietary: input.dietary,
      min_ado_score: input.min_ado_score,
      ...locale,
    };
  });

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

// MAX_SEARCH_RADIUS_MILES = 50 mi; the metric ceiling is computed once instead
// of re-derived per request so the JSON schema description matches the runtime
// clamp.
const MAX_SEARCH_RADIUS_METERS = Math.round(MAX_SEARCH_RADIUS_MILES * 1609.34);

export const exploreAreaForDietInputSchema = z
  .object({
    location: z
      .object({
        latitude: latitudeSchema,
        longitude: longitudeSchema,
      })
      .strict()
      .describe("Center of the area to explore (Google-style nested latitude/longitude)."),
    dietary: z
      .array(dietaryEnum, {
        invalid_type_error: "dietary must be an array of dietary filter strings",
      })
      .optional()
      .describe(
        "Optional dietary filter applied with AND logic. Only narrows the verified tier; menu_indexed and discovered rows pass through unfiltered (matches search_restaurants semantics).",
      ),
    radius_meters: z
      .number({ invalid_type_error: "radius_meters must be a number" })
      .positive({ message: "radius_meters must be > 0" })
      .max(MAX_SEARCH_RADIUS_METERS, {
        message: `radius_meters must be <= ${MAX_SEARCH_RADIUS_METERS} (${MAX_SEARCH_RADIUS_MILES} miles)`,
      })
      .optional()
      .describe(
        `Default 1000 m (about 0.62 mi). Max ${MAX_SEARCH_RADIUS_METERS} m (${MAX_SEARCH_RADIUS_MILES} miles).`,
      ),
    top_n_per_tier: z
      .number({ invalid_type_error: "top_n_per_tier must be a number" })
      .int({ message: "top_n_per_tier must be an integer" })
      .min(1, { message: "top_n_per_tier must be >= 1" })
      .max(10, { message: "top_n_per_tier must be <= 10" })
      .optional()
      .describe("Default 3, max 10. Each tier bucket is trimmed independently."),
  })
  .strict();

export const compareRestaurantsForDietInputSchema = z
  .object({
    restaurant_ids: z
      .array(
        z.string().uuid({ message: "restaurant_ids[] must be valid UUIDs" }),
        { invalid_type_error: "restaurant_ids must be an array of UUID strings" },
      )
      .min(2, { message: "restaurant_ids must include at least 2 entries" })
      .max(5, { message: "restaurant_ids must include at most 5 entries" })
      .describe("UUIDs copied from prior search_restaurants results."),
    dietary: z
      .array(dietaryEnum, {
        invalid_type_error: "dietary must be an array of dietary filter strings",
      })
      .min(1, { message: "dietary must include at least one filter" })
      .describe("Dietary flags applied with AND logic at item level."),
    user_location: z
      .object({
        latitude: latitudeSchema,
        longitude: longitudeSchema,
      })
      .strict()
      .optional()
      .describe(
        "Optional caller location. When set, each compared restaurant carries `distance_meters` (great-circle from this point) and distance becomes the final tiebreaker after item_count and trust tier. Restaurants without a geocoded location are flagged with `note: distance_not_available`.",
      ),
  })
  .strict();

const routePointSchema = z
  .object({
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  })
  .strict();

export const findRestaurantsAlongRouteInputSchema = z
  .object({
    origin: routePointSchema.describe("Route start coordinates."),
    destination: routePointSchema.describe("Route end coordinates."),
    dietary: z
      .array(dietaryEnum, {
        invalid_type_error: "dietary must be an array of dietary filter strings",
      })
      .optional()
      .describe(
        "Optional dietary filter. When set, route ranking prefers restaurants with more matching menu items.",
      ),
    max_results: z
      .number({ invalid_type_error: "max_results must be a number" })
      .int({ message: "max_results must be an integer" })
      .min(1, { message: "max_results must be >= 1" })
      .max(20, { message: "max_results must be <= 20" })
      .optional()
      .describe("Default 5, max 20."),
    route_polyline: z
      .string()
      .optional()
      .describe(
        "Optional encoded polyline from the caller's routing source (Google encoded polyline format).",
      ),
  })
  .strict();

export type SearchRestaurantsInput = z.infer<typeof searchRestaurantsInputSchema>;
export type GetRestaurantInput = z.infer<typeof getRestaurantInputSchema>;
export type GetMenuInput = z.infer<typeof getMenuInputSchema>;
export type GetAdoScoreBreakdownInput = z.infer<typeof getAdoScoreBreakdownInputSchema>;
export type ValidateMenuProtocolInput = z.infer<typeof validateMenuProtocolInputSchema>;
export type ExploreAreaForDietInput = z.infer<typeof exploreAreaForDietInputSchema>;
export type CompareRestaurantsForDietInput = z.infer<typeof compareRestaurantsForDietInputSchema>;
export type FindRestaurantsAlongRouteInput = z.infer<typeof findRestaurantsAlongRouteInputSchema>;

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
  explore_area_for_diet: exploreAreaForDietInputSchema,
  compare_restaurants_for_diet: compareRestaurantsForDietInputSchema,
  find_restaurants_along_route: findRestaurantsAlongRouteInputSchema,
} as const;

export type ToolName = keyof typeof TOOL_INPUT_SCHEMAS;
