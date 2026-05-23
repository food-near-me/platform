/**
 * Shared MCP server constants.
 *
 * Kept in a leaf module so every other MCP file (tools, RPC, HTTP handlers)
 * can import without pulling in their siblings' dependencies.
 */

export const MCP_VERSION = "2024-11-05";
export const SERVER_VERSION = "1.0.0";
export const MAX_SEARCH_RADIUS_MILES = 50;
export const MAX_RESULTS = 50;

/** JSON-RPC 2.0 error catalogue (standard + custom MCP codes). */
export const RPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: "Parse error" },
  INVALID_REQUEST: { code: -32600, message: "Invalid Request" },
  METHOD_NOT_FOUND: { code: -32601, message: "Method not found" },
  INVALID_PARAMS: { code: -32602, message: "Invalid params" },
  INTERNAL_ERROR: { code: -32603, message: "Internal error" },
  // Custom errors (-32000 to -32099)
  RESOURCE_NOT_FOUND: { code: -32001, message: "Resource not found" },
  VALIDATION_ERROR: { code: -32002, message: "Validation error" },
  DATABASE_ERROR: { code: -32003, message: "Database error" },
} as const;

export const VALID_DIETARY_FILTERS = [
  "vegan",
  "vegetarian",
  "gluten_free",
  "halal",
  "kosher",
  "nut_free",
  "dairy_free",
  "low_carb",
  "keto",
] as const;

export type DietaryFilter = (typeof VALID_DIETARY_FILTERS)[number];

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
  // Let browser-side agents read X-Request-ID / X-Response-Time off
  // the response so they can echo the id into their own log lines.
  "Access-Control-Expose-Headers": "X-Request-ID, X-Response-Time",
  "Access-Control-Max-Age": "86400",
} as const;
