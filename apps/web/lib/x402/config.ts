/**
 * x402 configuration (Phase B: local-mock settlement + config-driven paywall).
 *
 * FNM_X402_ENABLED must be "1" to arm anything. Unset in prod = pass-through.
 * Settlement uses a Facilitator selected by FNM_X402_FACILITATOR (default "mock").
 * Which resources require payment is FNM_X402_PAID_RESOURCES (comma list).
 */

export type X402Config = {
  enabled: boolean;
  facilitator: "mock" | string;
  freeQuotaPerDay: number;
  quotaWindowMs: number;
  network: string;
  usdcAddress: string;
  payTo: string;
  /** Atomic USDC units (6 decimals). Default 10000 = $0.01. */
  priceAtomic: string;
  maxTimeoutSeconds: number;
  /** Resource names that require payment after free quota. */
  paidResources: Set<string>;
  /** Optional internal Bearer bypass (exact match). Empty = disabled. */
  apiKeyBypass: string;
  resourceBaseUrl: string;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parsePaidResources(value: string | undefined): Set<string> {
  const raw = (value ?? "get_safety_attestation").trim();
  if (!raw) return new Set(["get_safety_attestation"]);
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/** Map REST endpoint keys ↔ MCP tool names for the paywall dial. */
const RESOURCE_ALIASES: Record<string, string[]> = {
  search: ["search", "search_restaurants"],
  search_restaurants: ["search", "search_restaurants"],
  restaurant: ["restaurant", "get_restaurant"],
  get_restaurant: ["restaurant", "get_restaurant"],
  menu: ["menu", "get_menu"],
  get_menu: ["menu", "get_menu"],
  get_safety_attestation: ["get_safety_attestation"],
};

export function loadX402Config(env: NodeJS.ProcessEnv = process.env): X402Config {
  const facilitator = (env.FNM_X402_FACILITATOR?.trim() || "mock").toLowerCase();
  return {
    enabled: env.FNM_X402_ENABLED === "1",
    facilitator,
    freeQuotaPerDay: parsePositiveInt(env.FNM_X402_FREE_QUOTA_PER_DAY, 100),
    quotaWindowMs: parsePositiveInt(env.FNM_X402_QUOTA_WINDOW_MS, 86_400_000),
    // v1 clients commonly expect "base"; CAIP-2 still accepted via override.
    network: env.FNM_X402_NETWORK?.trim() || "base",
    usdcAddress:
      env.FNM_X402_USDC_ADDRESS?.trim() ||
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo:
      env.FNM_X402_PAY_TO?.trim() ||
      "0x0000000000000000000000000000000000000402",
    priceAtomic: env.FNM_X402_PRICE_ATOMIC?.trim() || "10000",
    maxTimeoutSeconds: parsePositiveInt(env.FNM_X402_MAX_TIMEOUT_SECONDS, 60),
    paidResources: parsePaidResources(env.FNM_X402_PAID_RESOURCES),
    apiKeyBypass: env.FNM_X402_API_KEY?.trim() || "",
    resourceBaseUrl: (env.FNM_X402_RESOURCE_BASE_URL?.trim() || "https://foodnear.me").replace(
      /\/$/,
      "",
    ),
  };
}

/**
 * True when `name` (REST key or MCP tool) is in the paywall set.
 * Aliases let `search` and `search_restaurants` share one dial entry.
 */
export function isPaidResource(
  name: string,
  cfg: X402Config = loadX402Config(),
): boolean {
  if (cfg.paidResources.has(name)) return true;
  const aliases = RESOURCE_ALIASES[name];
  if (!aliases) return false;
  return aliases.some((alias) => cfg.paidResources.has(alias));
}

export function resourceUri(name: string, cfg: X402Config = loadX402Config()): string {
  switch (name) {
    case "search":
    case "search_restaurants":
      return `${cfg.resourceBaseUrl}/api/v1/search`;
    case "restaurant":
    case "get_restaurant":
      return `${cfg.resourceBaseUrl}/api/v1/restaurant/{id}`;
    case "menu":
    case "get_menu":
      return `${cfg.resourceBaseUrl}/api/v1/restaurant/{id}/menu.mp`;
    case "get_safety_attestation":
      return `${cfg.resourceBaseUrl}/mcp#get_safety_attestation`;
    default:
      return `${cfg.resourceBaseUrl}/mcp#${encodeURIComponent(name)}`;
  }
}
