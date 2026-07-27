import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";

import { hasApiKeyBypassToken } from "./auth";
import { buildPaymentChallenge } from "./challenge";
import { isPaidResource, loadX402Config, type X402Config } from "./config";
import { getFacilitator } from "./facilitator";
import { paymentRequiredResponse } from "./format402";
import {
  decodePaymentHeader,
  encodePaymentResponseHeader,
} from "./payment";
import type {
  PaymentRequirementsResponse,
  SettlementResponse,
  X402ResourceName,
} from "./types";

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

export type PaidAccessAllow = {
  kind: "allow";
  settlement?: SettlementResponse;
  remaining?: number;
};

export type PaidAccessChallenge = {
  kind: "challenge";
  challenge: PaymentRequirementsResponse;
  remaining: number;
};

export type PaidAccessPass = {
  kind: "pass";
};

export type PaidAccessOutcome = PaidAccessAllow | PaidAccessChallenge | PaidAccessPass;

/**
 * Shared paywall decision for REST + MCP.
 *
 * pass  — x402 off, or resource not in FNM_X402_PAID_RESOURCES
 * allow — free quota, API-key bypass, or verified+settled payment
 * challenge — over quota and no valid X-PAYMENT
 */
export async function evaluatePaidAccess(options: {
  resource: X402ResourceName | string;
  clientIp: string;
  paymentHeader?: string | null;
  authorizationHeader?: string | null;
  cfg?: X402Config;
}): Promise<PaidAccessOutcome> {
  const cfg = options.cfg ?? loadX402Config();
  if (!cfg.enabled) return { kind: "pass" };
  if (!isPaidResource(options.resource, cfg)) return { kind: "pass" };

  if (cfg.apiKeyBypass && hasApiKeyBypassToken(options.authorizationHeader, cfg.apiKeyBypass)) {
    return { kind: "allow" };
  }

  const key = `x402:${options.resource}:${options.clientIp}`;
  const { allowed, remaining } = await checkRateLimit({
    key,
    limit: cfg.freeQuotaPerDay,
    windowMs: cfg.quotaWindowMs,
  });

  if (allowed) {
    return { kind: "allow", remaining };
  }

  const payment = decodePaymentHeader(options.paymentHeader ?? null);
  if (!payment) {
    return {
      kind: "challenge",
      challenge: buildPaymentChallenge({ resource: options.resource, cfg }),
      remaining,
    };
  }

  const requirements = buildPaymentChallenge({ resource: options.resource, cfg }).accepts[0]!;
  const facilitator = getFacilitator(cfg.facilitator);

  const verified = await facilitator.verify(payment, requirements);
  if (!verified.valid) {
    return {
      kind: "challenge",
      challenge: buildPaymentChallenge({
        resource: options.resource,
        cfg,
        error: `Payment verification failed: ${verified.reason}`,
      }),
      remaining,
    };
  }

  const settlement = await facilitator.settle(payment, requirements);
  if (!settlement.success) {
    return {
      kind: "challenge",
      challenge: buildPaymentChallenge({
        resource: options.resource,
        cfg,
        error: `Payment settlement failed: ${settlement.errorReason ?? "unknown"}`,
      }),
      remaining,
    };
  }

  return { kind: "allow", settlement, remaining };
}

export type X402AccessResult =
  | { status: "allow"; settlement?: SettlementResponse }
  | { status: "deny"; response: NextResponse };

/**
 * REST guard. Returns deny+402 NextResponse, or allow (+ optional settlement
 * for the caller to attach as X-PAYMENT-RESPONSE).
 */
export async function checkX402Access(
  request: Request,
  endpoint: X402ResourceName | string,
): Promise<X402AccessResult> {
  const cfg = loadX402Config();
  const outcome = await evaluatePaidAccess({
    resource: endpoint,
    clientIp: getClientIp(request),
    paymentHeader: request.headers.get("x-payment") ?? request.headers.get("X-PAYMENT"),
    authorizationHeader: request.headers.get("authorization"),
    cfg,
  });

  if (outcome.kind === "pass" || outcome.kind === "allow") {
    return { status: "allow", settlement: outcome.kind === "allow" ? outcome.settlement : undefined };
  }

  return {
    status: "deny",
    response: paymentRequiredResponse({
      resource: endpoint,
      cfg,
      remaining: outcome.remaining,
    }),
  };
}

/** Attach X-PAYMENT-RESPONSE when a settlement occurred. */
export function withPaymentSettlement(
  response: NextResponse,
  settlement?: SettlementResponse,
): NextResponse {
  if (!settlement) return response;
  response.headers.set("X-PAYMENT-RESPONSE", encodePaymentResponseHeader(settlement));
  response.headers.set("X-Payment-Settled", settlement.facilitator);
  return response;
}
