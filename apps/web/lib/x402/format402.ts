import type { X402Config } from "./config";
import type { PaymentRequiredBody, X402Endpoint } from "./types";

const ENDPOINT_LABELS: Record<X402Endpoint, string> = {
  search: "search_restaurants",
  restaurant: "get_restaurant",
  menu: "get_menu",
};

export function buildPaymentRequiredBody(options: {
  endpoint: X402Endpoint;
  cfg: X402Config;
}): PaymentRequiredBody {
  const { endpoint, cfg } = options;
  const toolName = ENDPOINT_LABELS[endpoint];

  return {
    error: "payment_required",
    message:
      `Free tier quota exceeded (${cfg.freeQuotaPerDay}/day). ` +
      `Payment or API authentication required for ${toolName}.`,
    endpoint,
    free_quota_per_day: cfg.freeQuotaPerDay,
    payment_options: [
      {
        chain: "base",
        asset: "USDC",
        network: cfg.network,
        top_up_endpoint: "/api/v1/x402/top-up",
        min_top_up_usd: cfg.minTopUpUsd,
        min_balance_usd: cfg.minBalanceUsd,
        usdc_address: cfg.usdcAddress,
      },
    ],
    auth_options: {
      api_key: {
        header: "Authorization: Bearer",
        docs: "https://foodnear.me/docs/api#authentication",
      },
      x402_wallet: {
        header: "X-Sign-In-With-X",
        top_up_endpoint: "/api/v1/x402/top-up",
        docs: "https://foodnear.me/docs/api#x402-wallet",
      },
    },
  };
}

/** Agent-readable plain-text companion for logs and MCP hosts. */
export function format402Message(body: PaymentRequiredBody): string {
  const lines = [
    "foodnear.me returned 402 Payment Required.",
    "",
    body.message,
    "",
    "Authentication options:",
    "  A) API key — Authorization: Bearer <key>",
    "  B) x402 wallet — X-Sign-In-With-X (SIWE token) + prepaid USDC credits on Base",
    "",
    `Top up: POST ${body.auth_options.x402_wallet.top_up_endpoint}`,
    `Network: ${body.payment_options[0]?.network ?? "eip155:8453"}`,
    `Min top-up: $${body.payment_options[0]?.min_top_up_usd ?? 5} USDC`,
  ];
  return lines.join("\n");
}
