/**
 * Canonical x402 v1 types (PaymentRequirements / PaymentPayload / settlement)
 * plus FoodNearMe resource names for the paywall dial.
 *
 * Spec: https://github.com/coinbase/x402/blob/main/specs/x402-specification-v1.md
 */

/** REST endpoint keys + MCP tool names that may appear in FNM_X402_PAID_RESOURCES. */
export type X402ResourceName =
  | "search"
  | "restaurant"
  | "menu"
  | "get_safety_attestation"
  | "search_restaurants"
  | "get_restaurant"
  | "get_menu"
  | (string & {});

/** @deprecated Prefer X402ResourceName — kept for call-site compatibility. */
export type X402Endpoint = X402ResourceName;

export type PaymentRequirements = {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  asset: string;
  payTo: string;
  resource: string;
  description: string;
  mimeType: string;
  maxTimeoutSeconds: number;
  extra?: {
    name?: string;
    version?: string;
    /** Honest demonstrator marker — not part of the core x402 schema. */
    facilitator?: string;
    status?: string;
  };
};

export type PaymentRequirementsResponse = {
  x402Version: 1;
  error: string;
  accepts: PaymentRequirements[];
};

export type ExactEvmAuthorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
};

export type PaymentPayload = {
  x402Version: 1;
  scheme: "exact";
  network: string;
  payload: {
    signature: string;
    authorization: ExactEvmAuthorization;
  };
};

export type SettlementResponse = {
  success: boolean;
  transaction: string;
  network: string;
  payer: string;
  /** FNM extension — mock/real settlement correlation id. */
  settlement_id: string;
  /** Honest facilitator label (e.g. "mock"). */
  facilitator: string;
  errorReason?: string;
};

/** Human/log companion — not the wire challenge. */
export type PaymentRequiredCompanion = {
  resource: X402ResourceName;
  free_quota_per_day: number;
  message: string;
  status: "mock_facilitator" | "live_settlement";
};
