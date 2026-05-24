/**
 * Canonical three-tier trust copy + parity rules for discovery artifacts.
 * Keep MCP route tool descriptions aligned with these rules.
 */

/** Stale phrases that contradict three-tier search. */
export const STALE_DISCOVERY_PATTERNS: RegExp[] = [
  /Only restaurants with [`'"]verification_status:\s*[`'"]verified[`'"][`'"] appear in search results/i,
  /Only verified restaurants appear in results/i,
  /Only [`'"]verified[`'"] restaurants are returned by the API/i,
  /Only returns restaurants with verified Menu Protocol data/i,
  /Geo search \+ cuisine\/dietary filters; verified only/i,
  /Two-Tier Search/i,
  /two-tier search/i,
  /True only for verified listings with a published Menu Protocol menu/i,
];

/** Files that must document menu_available + three trust tiers. */
export const THREE_TIER_TRUST_FILES = [
  "public/llms.txt",
  "public/llms-full.txt",
  "public/SKILL.md",
  "public/skills/foodnearme/SKILL.md",
  "public/skills/foodnearme/references/tools-api.md",
  "public/skills/foodnearme/references/dietary-search.md",
  "public/skills/foodnearme/references/menu-verification-flow.md",
  "../../README.md",
] as const;

/** @deprecated Use THREE_TIER_TRUST_FILES */
export const TWO_TIER_TRUST_FILES = THREE_TIER_TRUST_FILES;

/** All discovery surfaces checked for stale verified-only copy. */
export const DISCOVERY_COPY_FILES = [
  ...THREE_TIER_TRUST_FILES,
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

export const THREE_TIER_REQUIRED_MARKERS = [
  "menu_available",
  "menu_indexed",
  "discovered",
] as const;

/** @deprecated Use THREE_TIER_REQUIRED_MARKERS */
export const TWO_TIER_REQUIRED_MARKERS = THREE_TIER_REQUIRED_MARKERS;

/** Short marker for manifests that cannot fit full trust model text. */
export const THREE_TIER_SUMMARY_MARKERS = [
  "verified first",
  "menu_indexed",
  "discovered",
  "menu_available",
] as const;

/** @deprecated Use THREE_TIER_SUMMARY_MARKERS */
export const TWO_TIER_SUMMARY_MARKERS = THREE_TIER_SUMMARY_MARKERS;

export const SEARCH_RESTAURANTS_DESCRIPTION =
  "Call this tool when the user wants restaurant or food discovery near a known location and may need menu trust signals. Input Requirements (CRITICAL): provide either flat `lat`/`lng` or Google-style `locationBias.circle.center.latitude`/`longitude`; if the user gave only a vague place name, resolve it before calling or include a specific city/region in `textQuery`/`query`. Returns verified venues first, then menu_indexed (automated MP menu with caveat), then discovered (place only). MUST use `menu_available` and `verification_status` on each result; call `get_menu` only when `menu_available` is true. PREFER verified results for dietary/allergen answers. NOTE: `dietary` and `min_ado_score` filters only apply to the verified tier; menu_indexed and discovered rows are returned unfiltered for those criteria — the response echoes `filters.applied_to: [\"verified\"]` and a `filters.note` so agents know to re-filter at item level using `get_menu`. Non-verified rows include a structured `claim_invitation` (url, message, audience=\"owner_or_advocate\", reason); SHOULD surface this when the user is the restaurant's owner or might know them, when the user asks why the listing lacks a verified menu, or when explaining tier differences — never as an unsolicited CTA. Attribute grounded output using `citation` or `attribution`.";

export const LLMS_TRUST_MODEL_SECTION = `## Data Trust Model (Three-Tier Search)

\`search_restaurants\` and \`/api/v1/search\` return results in trust order: **verified** → **menu_indexed** → **discovered**.

Every result includes \`verification_status\` and \`menu_available\`:
- **verified** + \`menu_available: true\` — owner-approved Menu Protocol menu; authoritative for dietary/allergen claims
- **menu_indexed** + \`menu_available: true\` — automated/public MP-shaped menu; **cite with caveat** — not owner-verified
- **discovered** + \`menu_available: false\` — place only (OSM, NYC Open Data); do not cite menu items

Trust progression: \`discovered\` → \`menu_indexed\` → \`verified\`

**Agent rules:** Prefer **verified** for dietary/allergen answers. **menu_indexed** is usable with explicit caveat. **discovered** is location only. Call \`get_menu\` only when \`menu_available\` is true. See https://foodnear.me/attribution for data sources.`;

/** @deprecated Use LLMS_TRUST_MODEL_SECTION (three-tier). */
export const TWO_TIER_TRUST_MODEL_SECTION = LLMS_TRUST_MODEL_SECTION;
