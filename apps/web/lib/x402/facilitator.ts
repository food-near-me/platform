/**
 * Facilitator interface + MockFacilitator (Phase B local-mock settlement).
 *
 * A real Base/CDP facilitator is a later drop-in behind the same interface.
 * Mock validates payload shape + amount ≥ price and returns synthetic ids —
 * no chain, no wallet, no real money.
 */

import { createHash, randomUUID } from "node:crypto";

import type { PaymentPayload, PaymentRequirements, SettlementResponse } from "./types";

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: string };

export type SettleResult = SettlementResponse;

export interface Facilitator {
  readonly name: string;
  verify(
    payment: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResult>;
  settle(
    payment: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResult>;
}

function amountMeetsMinimum(value: string, required: string): boolean {
  try {
    return BigInt(value) >= BigInt(required);
  } catch {
    return false;
  }
}

function shapeOk(payment: PaymentPayload, requirements: PaymentRequirements): string | null {
  if (payment.x402Version !== 1) return "unsupported_x402_version";
  if (payment.scheme !== "exact") return "unsupported_scheme";
  if (payment.network !== requirements.network) return "network_mismatch";
  if (payment.scheme !== requirements.scheme) return "scheme_mismatch";

  const auth = payment.payload?.authorization;
  if (!auth || typeof auth !== "object") return "missing_authorization";
  if (!payment.payload.signature || typeof payment.payload.signature !== "string") {
    return "missing_signature";
  }
  if (typeof auth.from !== "string" || !auth.from.startsWith("0x")) return "invalid_from";
  if (typeof auth.to !== "string" || auth.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
    return "pay_to_mismatch";
  }
  if (!amountMeetsMinimum(auth.value, requirements.maxAmountRequired)) {
    return "underpaid";
  }
  if (typeof auth.nonce !== "string" || auth.nonce.length < 8) return "invalid_nonce";
  return null;
}

/**
 * Deterministic local mock — accepts any well-shaped payload that meets the
 * amount and payTo checks. Signatures are not cryptographically verified.
 */
export class MockFacilitator implements Facilitator {
  readonly name = "mock";

  async verify(
    payment: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResult> {
    const reason = shapeOk(payment, requirements);
    if (reason) return { valid: false, reason };
    return { valid: true };
  }

  async settle(
    payment: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResult> {
    const verified = await this.verify(payment, requirements);
    if (!verified.valid) {
      return {
        success: false,
        transaction: "",
        network: requirements.network,
        payer: payment.payload?.authorization?.from ?? "",
        settlement_id: "",
        facilitator: this.name,
        errorReason: verified.reason,
      };
    }

    const settlementId = `mock_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const txMaterial = createHash("sha256")
      .update(
        [
          settlementId,
          payment.payload.authorization.from,
          payment.payload.authorization.to,
          payment.payload.authorization.value,
          payment.payload.authorization.nonce,
        ].join("|"),
      )
      .digest("hex");

    return {
      success: true,
      transaction: `mock:${txMaterial.slice(0, 64)}`,
      network: requirements.network,
      payer: payment.payload.authorization.from,
      settlement_id: settlementId,
      facilitator: this.name,
    };
  }
}

export function getFacilitator(name: string = "mock"): Facilitator {
  const key = name.trim().toLowerCase() || "mock";
  if (key === "mock") return new MockFacilitator();
  // Real Base/CDP facilitator is a later drop-in — refuse unknown names closed.
  throw new Error(
    `Unknown FNM_X402_FACILITATOR="${name}". Only "mock" is shipped in Phase B.`,
  );
}
