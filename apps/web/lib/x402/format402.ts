/**
 * 402 response helpers — canonical challenge is built in challenge.ts.
 * This module keeps the human/log companion and NextResponse factory.
 */

export {
  buildPaymentChallenge,
  buildPaymentCompanion,
  buildPaymentRequirements,
  format402Message,
} from "./challenge";

import { NextResponse } from "next/server";

import { buildPaymentChallenge, format402Message } from "./challenge";
import type { X402Config } from "./config";
import type { PaymentRequirementsResponse, X402ResourceName } from "./types";

/** @deprecated Prefer buildPaymentChallenge — kept for transitional imports. */
export function buildPaymentRequiredBody(options: {
  endpoint: X402ResourceName | string;
  cfg: X402Config;
}): PaymentRequirementsResponse {
  return buildPaymentChallenge({ resource: options.endpoint, cfg: options.cfg });
}

export function paymentRequiredResponse(options: {
  resource: X402ResourceName | string;
  cfg: X402Config;
  remaining: number;
}): NextResponse {
  const body = buildPaymentChallenge({ resource: options.resource, cfg: options.cfg });
  return NextResponse.json(body, {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      "X-Payment-Required": "x402",
      "X-RateLimit-Remaining": String(options.remaining),
      "X-RateLimit-Limit": String(options.cfg.freeQuotaPerDay),
      "X-Payment-Message": format402Message(body).split("\n")[0] ?? "Payment required",
    },
  });
}
