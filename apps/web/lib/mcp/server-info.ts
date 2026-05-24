/**
 * MCP server metadata and the canonical tool catalogue.
 *
 * `ALL_TOOLS` is the source of truth for every known MCP tool, while
 * `getEnabledTools()` applies the optional `FNM_MCP_ENABLED_TOOLS` runtime
 * allowlist for `tools/list` and static `GET /mcp` discovery. Tool
 * implementations live in
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
  annotations: {
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: false;
    openWorldHint: false;
  };
};

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  search_restaurants: SEARCH_RESTAURANTS_DESCRIPTION,
  get_restaurant:
    "Call this tool after `search_restaurants` when you need a detailed restaurant profile for a returned `id`. Input Requirements (CRITICAL): `restaurant_id` MUST be a UUID copied from a `search_restaurants` result; do not invent IDs. Returns Schema.org/Restaurant JSON-LD markup plus Menu Protocol extensions including ADO score, verification status, menu availability, payment methods, and dietary certifications. MUST inspect `menu_available` before calling `get_menu`; if false, use the claim link instead of citing menu items. Non-verified responses include a top-level `claim_invitation` (url, message, audience=\"owner_or_advocate\", reason) the agent SHOULD share if the user is the owner or might know them. Attribute grounded output using `citation` or `attribution`.",
  get_menu:
    "Call this tool only when a `search_restaurants` or `get_restaurant` response has `menu_available: true`. Input Requirements (CRITICAL): `restaurant_id` MUST be a UUID copied from a prior FNM result. Returns the full menu in Menu Protocol v1.0 format with item dietary booleans, declared allergens, customization options, preparation times, trust notice, and signature metadata. PREFER `verification_status: \"verified\"` for dietary/allergen answers. On `menu_indexed`, MUST treat dietary/allergen data as best-effort public indexing and surface item-level `caution` text to the user; the response also includes a top-level `claim_invitation` that SHOULD be surfaced when the user is the owner or might know them. Attribute grounded output using `citation` or `attribution`.",
  get_ado_score_breakdown:
    "Call this tool when a restaurant owner, operator, or agent wants to understand why a restaurant is more or less agent-ready. Input Requirements (CRITICAL): `restaurant_id` MUST be a UUID copied from a FNM result. Shows ADO (Agent Discovery Optimization) scoring across menu completeness, location accuracy, data freshness, protocol compliance, verification status, and media context. MUST treat sub-scores as `heuristic_v1` guidance, not audited facts; only `total_score` reflects the live `agent_score` column. Attribute grounded output using `citation` or `attribution`.",
  validate_menu_protocol:
    "Call this tool when validating a draft or exported Menu Protocol payload before submission or integration. Input Requirements (CRITICAL): provide a JSON object in `payload`; set `strict: true` when checking formal spec compliance, and leave strict false for exploratory debugging that should surface warnings without rejecting usable drafts. Returns validation errors, schema warnings, Schema.org compliance gaps, and recommendations for improving ADO score. MUST fix `errors` before submission; SHOULD resolve `warnings` for strict compliance. Attribute grounded output using `citation` or `attribution`.",
  explore_area_for_diet:
    "Call this tool when the user wants a neighborhood overview that surfaces trust tiers explicitly — for example, \"what's good for vegan eaters within a mile of this location\" or \"survey the area around X\". Input Requirements (CRITICAL): `location` MUST be `{latitude, longitude}` (Google-style nested object). Returns three tier buckets — `verified`, `menu_indexed`, `discovered` — each trimmed to `top_n_per_tier` (default 3, max 10). When `dietary` is set, the filter only narrows the `verified` bucket, matching `search_restaurants` semantics; `tier_counts` always reflects the full result set and `next_steps` flags any empty bucket. PREFER `verified` for dietary/allergen answers; MUST check `menu_available` before calling `get_menu` on any returned id. Non-verified entries include a structured `claim_invitation` the agent SHOULD surface when the user is the owner or might know them. Attribute grounded output using `citation` or `attribution`.",
  compare_restaurants_for_diet:
    "Call this tool when the user wants a side-by-side dietary comparison for 2 to 5 specific restaurants already identified in FNM results. Input Requirements (CRITICAL): `restaurant_ids` MUST be UUIDs copied from prior FNM responses, and `dietary` MUST include at least one supported dietary flag. Optional `user_location` (`{latitude, longitude}`) enables per-row `distance_meters` and uses distance as the final tiebreaker after item count and trust tier. The tool chains `get_restaurant` and `get_menu` internally, then ranks by dietary-eligible item count, trust tier (`verified` preferred over `menu_indexed`, then `discovered`), and optionally distance. PREFER verified-tier winners for authoritative dietary/allergen answers; MUST treat menu_indexed matches as best-effort public indexing with caveats. Non-verified entries carry a structured `claim_invitation` SHOULD be surfaced when the user could help with ownership. Attribute grounded output using `citation` or `attribution`.",
  find_restaurants_along_route:
    "Call this tool when the user wants route-adjacent dining options between two known coordinates and may care about dietary fit. Input Requirements (CRITICAL): both `origin` and `destination` MUST be `{latitude, longitude}` objects; optional `route_polyline` MUST be a valid encoded polyline if provided. The tool samples waypoints along the corridor, merges nearby search matches, then ranks by dietary match count (when requested), trust tier, and route proximity. SHOULD provide `route_polyline` from your routing source for tighter ranking; otherwise fallback is a local great-circle approximation. MUST check `menu_available` before calling `get_menu` on returned ids. Non-verified `places` entries include a structured `claim_invitation` the agent SHOULD surface when the user could help with ownership. Attribute grounded output using `citation` or `attribution`.",
};

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const TOOL_FILTER_ENV = "FNM_MCP_ENABLED_TOOLS";

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
    annotations: READ_ONLY_ANNOTATIONS,
  }));
}

export const ALL_TOOLS: ToolDefinition[] = (() => {
  if (!cachedTools) cachedTools = buildTools();
  return cachedTools;
})();

export function parseEnabledToolNames(raw = process.env[TOOL_FILTER_ENV]): Set<ToolName> | null {
  if (!raw || raw.trim() === "" || raw.trim() === "*") return null;

  const known = new Set(Object.keys(TOOL_INPUT_SCHEMAS) as ToolName[]);
  const enabled = new Set<ToolName>();
  for (const entry of raw.split(",")) {
    const name = entry.trim();
    if (!name) continue;
    if (known.has(name as ToolName)) enabled.add(name as ToolName);
  }
  return enabled;
}

export function getEnabledTools(): ToolDefinition[] {
  const enabled = parseEnabledToolNames();
  if (!enabled) return ALL_TOOLS;
  return ALL_TOOLS.filter((tool) => enabled.has(tool.name));
}

export function isToolEnabled(name: ToolName): boolean {
  const enabled = parseEnabledToolNames();
  return !enabled || enabled.has(name);
}

export function disabledToolMessage(name: ToolName): string {
  return `Tool ${name} is disabled by ${TOOL_FILTER_ENV}; unset it, set it to "*", or include ${name} in the comma-separated list to enable this tool.`;
}

/** @deprecated Use ALL_TOOLS or getEnabledTools() depending on context. */
export const TOOLS: ToolDefinition[] = ALL_TOOLS;
