/**
 * Payment header encode/decode + mock payload helpers for tests/demos.
 */

import { randomBytes } from "node:crypto";

import type { PaymentPayload, PaymentRequirements, SettlementResponse } from "./types";

export function encodePaymentHeader(payment: PaymentPayload): string {
  return Buffer.from(JSON.stringify(payment), "utf8").toString("base64");
}

export function decodePaymentHeader(header: string | null | undefined): PaymentPayload | null {
  if (!header || !header.trim()) return null;

  const raw = header.trim();
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as PaymentPayload;
    if (parsed?.x402Version !== 1 || parsed.scheme !== "exact") return null;
    return parsed;
  } catch {
    // Allow raw JSON in local tests for readability.
    try {
      const parsed = JSON.parse(raw) as PaymentPayload;
      if (parsed?.x402Version !== 1 || parsed.scheme !== "exact") return null;
      return parsed;
    } catch {
      return null;
    }
  }
}

export function encodePaymentResponseHeader(settlement: SettlementResponse): string {
  return Buffer.from(JSON.stringify(settlement), "utf8").toString("base64");
}

export function decodePaymentResponseHeader(
  header: string | null | undefined,
): SettlementResponse | null {
  if (!header || !header.trim()) return null;
  try {
    const json = Buffer.from(header.trim(), "base64").toString("utf8");
    return JSON.parse(json) as SettlementResponse;
  } catch {
    return null;
  }
}

/** Build a well-shaped mock PaymentPayload that MockFacilitator will accept. */
export function buildMockPaymentPayload(
  requirements: PaymentRequirements,
  options?: { from?: string; value?: string },
): PaymentPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    x402Version: 1,
    scheme: "exact",
    network: requirements.network,
    payload: {
      signature: `mock:${randomBytes(32).toString("hex")}`,
      authorization: {
        from: options?.from ?? "0x0000000000000000000000000000000000000A9E",
        to: requirements.payTo,
        value: options?.value ?? requirements.maxAmountRequired,
        validAfter: "0",
        validBefore: String(now + 600),
        nonce: `0x${randomBytes(32).toString("hex")}`,
      },
    },
  };
}
