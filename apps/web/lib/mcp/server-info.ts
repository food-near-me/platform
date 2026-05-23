/**
 * MCP server metadata and the canonical tool catalogue.
 *
 * `TOOLS` is the source of truth for `tools/list` over JSON-RPC AND for the
 * static `GET /mcp` discovery surface. Tool implementations live in
 * `lib/mcp/tools/*` and are wired into the dispatch table in `lib/mcp/rpc.ts`.
 *
 * Each tool's `inputSchema` is derived from its Zod schema in
 * `lib/mcp/tools/inputs.ts` via `zod-to-json-schema`, so the documented
 * shape and the runtime validator can never drift apart. Per-tool
 * descriptions and (where useful) tool-specific schema customizations
 * are layered in below.
 */

import { zodToJsonSchema } from "zod-to-json-schema";

import { SEARCH_RESTAURANTS_DESCRIPTION } from "@/lib/discovery/trust-model-copy";
import { MCP_VERSION, SERVER_VERSION } from "./constants";
import { TOOL_INPUT_SCHEMAS, type ToolName } from "./tools/inputs";

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

type JsonSchemaObject = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean | Record<string, unknown>;
  // zod-to-json-schema emits these on top-level draft-07 schemas; we strip
  // them because MCP clients only need the structural shape.
  $schema?: string;
};

function buildJsonSchema(name: ToolName): JsonSchemaObject {
  const raw = zodToJsonSchema(TOOL_INPUT_SCHEMAS[name], {
    target: "openApi3",
    $refStrategy: "none",
  }) as JsonSchemaObject;

  // Surface MCP-style `type: "object"` even when zod-to-json-schema picks
  // up additional structural keywords.
  return {
    ...raw,
    type: "object",
  };
}

export type ToolDefinition = {
  name: ToolName;
  description: string;
  inputSchema: JsonSchemaObject;
};

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  search_restaurants: SEARCH_RESTAURANTS_DESCRIPTION,
  get_restaurant:
    "Get detailed restaurant profile with Schema.org/Restaurant JSON-LD markup and Menu Protocol extensions including ADO score, verification status, payment methods, and dietary certifications.",
  get_menu:
    "Get the full menu in Menu Protocol v1.0 format. Includes all items with explicit dietary boolean flags, declared allergens, customization options with price adjustments, preparation times, and cryptographic signature proving owner approval.",
  get_ado_score_breakdown:
    "Get the ADO (Agent Discovery Optimization) score breakdown for a restaurant. Shows weighted scoring across menu completeness, location accuracy, data freshness, protocol compliance, verification status, and media context. Includes recommendations for improvement.",
  validate_menu_protocol:
    "Validate a JSON payload against the Menu Protocol v1.0 schema. Returns validation errors, missing required fields, Schema.org compliance gaps, and recommendations for improving ADO score. Use this to check menu data before submission or to debug integration issues.",
};

/**
 * Build the tool catalogue lazily so each test run gets a fresh,
 * deterministically-generated JSON schema. Cached after first build.
 */
let cachedTools: ToolDefinition[] | null = null;

function buildTools(): ToolDefinition[] {
  const names = Object.keys(TOOL_INPUT_SCHEMAS) as ToolName[];
  return names.map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    inputSchema: buildJsonSchema(name),
  }));
}

export const TOOLS: ToolDefinition[] = (() => {
  if (!cachedTools) cachedTools = buildTools();
  return cachedTools;
})();
