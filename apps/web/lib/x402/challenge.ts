/**
 * Single challenge builder for REST HTTP 402 and MCP JSON-RPC payment_required.
 */

import { loadX402Config, resourceUri, type X402Config } from "./config";
import type {
  PaymentRequirements,
  PaymentRequirementsResponse,
  PaymentRequiredCompanion,
  X402ResourceName,
} from "./types";

const RESOURCE_LABELS: Record<string, string> = {
  search: "search_restaurants",
  search_restaurants: "search_restaurants",
  restaurant: "get_restaurant",
  get_restaurant: "get_restaurant",
  menu: "get_menu",
  get_menu: "get_menu",
  get_safety_attestation: "get_safety_attestation",
};

export function buildPaymentRequirements(options: {
  resource: X402ResourceName | string;
  cfg?: X402Config;
}): PaymentRequirements {
  const cfg = options.cfg ?? loadX402Config();
  const label = RESOURCE_LABELS[options.resource] ?? options.resource;
  const isMock = cfg.facilitator === "mock";

  return {
    scheme: "exact",
    network: cfg.network,
    maxAmountRequired: cfg.priceAtomic,
    asset: cfg.usdcAddress,
    payTo: cfg.payTo,
    resource: resourceUri(options.resource, cfg),
    description: isMock
      ? `foodnear.me ${label} (x402 demonstrator — mock facilitator, not live mainnet settlement)`
      : `foodnear.me ${label}`,
    mimeType: "application/json",
    maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    extra: {
      name: "USDC",
      version: "2",
      facilitator: cfg.facilitator,
      status: isMock ? "mock_facilitator" : "live_settlement",
    },
  };
}

export function buildPaymentChallenge(options: {
  resource: X402ResourceName | string;
  cfg?: X402Config;
  error?: string;
}): PaymentRequirementsResponse {
  const cfg = options.cfg ?? loadX402Config();
  const label = RESOURCE_LABELS[options.resource] ?? options.resource;
  const isMock = cfg.facilitator === "mock";

  const defaultError = isMock
    ? `X-PAYMENT header is required for ${label}. Settlement uses a local mock facilitator — not live mainnet USDC.`
    : `X-PAYMENT header is required for ${label}.`;

  return {
    x402Version: 1,
    error: options.error ?? defaultError,
    accepts: [buildPaymentRequirements({ resource: options.resource, cfg })],
  };
}

/** Agent-readable plain-text companion for logs and MCP hosts. */
export function format402Message(challenge: PaymentRequirementsResponse): string {
  const req = challenge.accepts[0];
  const lines = [
    "foodnear.me returned 402 Payment Required (x402 v1).",
    "",
    challenge.error,
    "",
    `Resource: ${req?.resource ?? "(none)"}`,
    `Network: ${req?.network ?? "base"}`,
    `Asset (USDC): ${req?.asset ?? ""}`,
    `Amount (atomic): ${req?.maxAmountRequired ?? ""}`,
    `Pay to: ${req?.payTo ?? ""}`,
    `Facilitator: ${req?.extra?.facilitator ?? "mock"}`,
    `Status: ${req?.extra?.status ?? "mock_facilitator"}`,
    "",
    "Retry with header X-PAYMENT: <base64 PaymentPayload>.",
  ];
  return lines.join("\n");
}

export function buildPaymentCompanion(options: {
  resource: X402ResourceName | string;
  cfg?: X402Config;
}): PaymentRequiredCompanion {
  const cfg = options.cfg ?? loadX402Config();
  const challenge = buildPaymentChallenge({ resource: options.resource, cfg });
  return {
    resource: options.resource as X402ResourceName,
    free_quota_per_day: cfg.freeQuotaPerDay,
    message: challenge.error,
    status: cfg.facilitator === "mock" ? "mock_facilitator" : "live_settlement",
  };
}
