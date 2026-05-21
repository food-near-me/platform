/**
 * Canonical two-tier search copy + parity rules for discovery artifacts.
 * Keep MCP route tool descriptions aligned with these rules.
 */

/** Stale phrases that contradict two-tier search (verified first, then discovered). */
export const STALE_DISCOVERY_PATTERNS: RegExp[] = [
  /Only restaurants with [`'"]verification_status:\s*[`'"]verified[`'"][`'"] appear in search results/i,
  /Only verified restaurants appear in results/i,
  /Only [`'"]verified[`'"] restaurants are returned by the API/i,
  /Only returns restaurants with verified Menu Protocol data/i,
  /Geo search \+ cuisine\/dietary filters; verified only/i,
];

/** Files that must document menu_available + discovered two-tier search. */
export const TWO_TIER_TRUST_FILES = [
  "public/llms.txt",
  "public/llms-full.txt",
  "public/SKILL.md",
  "../../README.md",
] as const;

/** All discovery surfaces checked for stale verified-only copy. */
export const DISCOVERY_COPY_FILES = [
  ...TWO_TIER_TRUST_FILES,
  "public/.well-known/mcp-server.json",
  "public/.well-known/agent.json",
  "public/.well-known/agentroot.json",
  "public/.well-known/ai-plugin.json",
  "public/.well-known/gemini-extension.json",
  "public/.well-known/services.json",
  "public/openapi.json",
  "docs/example-agent-flows.md",
  "docs/registry-submission-guide.md",
  "../../server.json",
] as const;

export const TWO_TIER_REQUIRED_MARKERS = ["menu_available", "discovered"] as const;

/** Short marker for manifests that cannot fit full trust model text. */
export const TWO_TIER_SUMMARY_MARKERS = [
  "verified first",
  "discovered",
  "menu_available",
] as const;

export const SEARCH_RESTAURANTS_DESCRIPTION =
  "Search for restaurants near a location. Returns verified venues first (owner-approved Menu Protocol menus), then discovered venues (basic listing only — no authoritative menu). Use menu_available and verification_status on each result. Call get_menu only when menu_available is true.";

export const LLMS_TRUST_MODEL_SECTION = `## Data Trust Model (Two-Tier Search)

\`search_restaurants\` and \`/api/v1/search\` return **verified venues first**, then **discovered listings** (place data only — no authoritative menu).

Every result includes \`verification_status\` and \`menu_available\`:
- **verified** + \`menu_available: true\` — owner-approved Menu Protocol menu; safe to call \`get_menu\`
- **discovered** + \`menu_available: false\` — basic place info from open data (OSM, NYC Open Data); do not cite menu items

Trust progression: \`discovered\` → \`menu_indexed\` → \`verified\`

**Agent rules:** Prefer verified results for menu/dietary answers. Call \`get_menu\` only when \`menu_available\` is true. See https://foodnear.me/attribution for data sources.`;
