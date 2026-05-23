import type { X402Config } from "./config";
import type { PaymentRequiredBody, X402Endpoint } from "./types";

const ENDPOINT_LABELS: Record<X402Endpoint, string> = {
  search: "search_restaurants",
  restaurant: "get_restaurant",
  menu: "get_menu",
};

/**
 * Optional top-up route. Only emitted when `FNM_X402_TOPUP_ENDPOINT` is set,
 * which lands in Phase B alongside the actual settlement route. Until then,
 * the field is omitted so agents are not pointed at a 404.
 */
function readTopUpEndpoint(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.FNM_X402_TOPUP_ENDPOINT?.trim();
  return value && value.length > 0 ? value : undefined;
}

export function buildPaymentRequiredBody(options: {
  endpoint: X402Endpoint;
  cfg: X402Config;
}): PaymentRequiredBody {
  const { endpoint, cfg } = options;
  const toolName = ENDPOINT_LABELS[endpoint];
  const topUpEndpoint = readTopUpEndpoint();
  const status = topUpEndpoint ? "phase_b_settlement" : "phase_a_guard_only";

  return {
    error: "payment_required",
    message:
      `Free tier quota exceeded (${cfg.freeQuotaPerDay}/day). ` +
      `Payment or API authentication required for ${toolName}.` +
      (status === "phase_a_guard_only"
        ? " Note: x402 settlement (Phase B) is not yet shipped — use an API key for now."
        : ""),
    endpoint,
    free_quota_per_day: cfg.freeQuotaPerDay,
    payment_options: [
      {
        chain: "base",
        asset: "USDC",
        network: cfg.network,
        ...(topUpEndpoint ? { top_up_endpoint: topUpEndpoint } : {}),
        min_top_up_usd: cfg.minTopUpUsd,
        min_balance_usd: cfg.minBalanceUsd,
        usdc_address: cfg.usdcAddress,
        status,
      },
    ],
    auth_options: {
      api_key: {
        header: "Authorization: Bearer",
        docs: "https://foodnear.me/docs/api#authentication",
      },
      x402_wallet: {
        header: "X-Sign-In-With-X",
        ...(topUpEndpoint ? { top_up_endpoint: topUpEndpoint } : {}),
        docs: "https://foodnear.me/docs/api#x402-wallet",
        status,
      },
    },
  };
}

/** Agent-readable plain-text companion for logs and MCP hosts. */
export function format402Message(body: PaymentRequiredBody): string {
  const topUp = body.auth_options.x402_wallet.top_up_endpoint;
  const lines = [
    "foodnear.me returned 402 Payment Required.",
    "",
    body.message,
    "",
    "Authentication options:",
    "  A) API key — Authorization: Bearer <key>",
    "  B) x402 wallet — X-Sign-In-With-X (SIWE token) + prepaid USDC credits on Base",
    "",
    ...(topUp ? [`Top up: POST ${topUp}`] : ["Top up: not yet available (x402 Phase B pending)"]),
    `Network: ${body.payment_options[0]?.network ?? "eip155:8453"}`,
    `Min top-up: $${body.payment_options[0]?.min_top_up_usd ?? 5} USDC`,
  ];
  return lines.join("\n");
}
