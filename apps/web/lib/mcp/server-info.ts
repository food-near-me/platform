/**
 * MCP server metadata and the canonical tool catalogue.
 *
 * `TOOLS` is the source of truth for `tools/list` over JSON-RPC AND for the
 * static `GET /mcp` discovery surface. Tool implementations live in
 * `lib/mcp/tools/*` and are wired into the dispatch table in `lib/mcp/rpc.ts`.
 */

import { SEARCH_RESTAURANTS_DESCRIPTION } from "@/lib/discovery/trust-model-copy";
import {
  MAX_SEARCH_RADIUS_MILES,
  MCP_VERSION,
  SERVER_VERSION,
  VALID_DIETARY_FILTERS,
} from "./constants";

export const SERVER_INFO = {
  name: "foodnear.me",
  version: SERVER_VERSION,
  protocolVersion: MCP_VERSION,
  capabilities: {
    tools: { listChanged: false },
    resources: { listChanged: false, subscribe: false },
    prompts: { listChanged: false },
  },
} as const;

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export const TOOLS: ToolDefinition[] = [
  {
    name: "search_restaurants",
    description: SEARCH_RESTAURANTS_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Food type, cuisine, or restaurant name. Examples: 'thai', 'pizza', 'sushi', 'vegan burgers'. Leave empty to search all cuisines.",
        },
        lat: {
          type: "number",
          description: "Latitude of search center (-90 to 90)",
        },
        lng: {
          type: "number",
          description: "Longitude of search center (-180 to 180)",
        },
        radius_miles: {
          type: "number",
          description: `Search radius in miles. Default: 5, Max: ${MAX_SEARCH_RADIUS_MILES}`,
          default: 5,
        },
        dietary: {
          type: "array",
          items: { type: "string", enum: VALID_DIETARY_FILTERS },
          description: "Filter by dietary certifications. Multiple filters use AND logic.",
        },
        min_ado_score: {
          type: "number",
          description:
            "Minimum ADO score (0.0-5.0). Higher scores indicate better agent-readiness.",
          default: 0,
          minimum: 0,
          maximum: 5,
        },
      },
      required: ["lat", "lng"],
    },
  },
  {
    name: "get_restaurant",
    description:
      "Get detailed restaurant profile with Schema.org/Restaurant JSON-LD markup and Menu Protocol extensions including ADO score, verification status, payment methods, and dietary certifications.",
    inputSchema: {
      type: "object",
      properties: {
        restaurant_id: {
          type: "string",
          format: "uuid",
          description: "Restaurant UUID (from search results)",
        },
      },
      required: ["restaurant_id"],
    },
  },
  {
    name: "get_menu",
    description:
      "Get the full menu in Menu Protocol v1.0 format. Includes all items with explicit dietary boolean flags, declared allergens, customization options with price adjustments, preparation times, and cryptographic signature proving owner approval.",
    inputSchema: {
      type: "object",
      properties: {
        restaurant_id: {
          type: "string",
          format: "uuid",
          description: "Restaurant UUID (from search results)",
        },
      },
      required: ["restaurant_id"],
    },
  },
  {
    name: "get_ado_score_breakdown",
    description:
      "Get the ADO (Agent Discovery Optimization) score breakdown for a restaurant. Shows weighted scoring across menu completeness, location accuracy, data freshness, protocol compliance, verification status, and media context. Includes recommendations for improvement.",
    inputSchema: {
      type: "object",
      properties: {
        restaurant_id: {
          type: "string",
          format: "uuid",
          description: "Restaurant UUID",
        },
      },
      required: ["restaurant_id"],
    },
  },
  {
    name: "validate_menu_protocol",
    description:
      "Validate a JSON payload against the Menu Protocol v1.0 schema. Returns validation errors, missing required fields, Schema.org compliance gaps, and recommendations for improving ADO score. Use this to check menu data before submission or to debug integration issues.",
    inputSchema: {
      type: "object",
      properties: {
        payload: {
          type: "object",
          description:
            "The Menu Protocol JSON payload to validate. Should include version, domain, restaurant, and menu objects.",
        },
        strict: {
          type: "boolean",
          description:
            "If true, also check optional fields and Schema.org best practices. Default: false (only check required fields).",
          default: false,
        },
      },
      required: ["payload"],
    },
  },
];
