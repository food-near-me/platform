#!/usr/bin/env npx tsx
/**
 * Flag-plant demo: agent asks for a signed allergy-safety attestation →
 * gets x402 challenge → pays via mock facilitator → receives signed
 * fnm-safety-v1 attestation + settlement receipt.
 *
 * No chain, no wallet, no real money. Proves the 402 ↔ X-PAYMENT loop.
 *
 * Usage:
 *   npx tsx scripts/x402-attestation-demo.ts
 */

import {
  generateSigningKeyPair,
  verifyMenuSignature,
} from "@foodnearme/menu-protocol";

import {
  buildSafetyAttestation,
  canonicalizeSafetyClaim,
  SAFETY_ATTESTATION_SCHEME,
} from "../lib/mcp/attestation";
import { buildPaymentChallenge, format402Message } from "../lib/x402/challenge";
import { evaluatePaidAccess } from "../lib/x402/guard";
import {
  buildMockPaymentPayload,
  encodePaymentHeader,
} from "../lib/x402/payment";

async function main() {
  const previous: Record<string, string | undefined> = {};
  const envOverrides: Record<string, string> = {
    FNM_X402_ENABLED: "1",
    FNM_X402_FACILITATOR: "mock",
    FNM_X402_PAID_RESOURCES: "get_safety_attestation",
    FNM_X402_FREE_QUOTA_PER_DAY: "1",
  };

  for (const [key, value] of Object.entries(envOverrides)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  const signingKey = generateSigningKeyPair();

  try {
    const clientIp = `demo-agent-${Date.now()}`;
    const restaurantId = "00000000-0000-4000-8000-000000000042";
    const asOf = new Date().toISOString();

    console.log("═══════════════════════════════════════════════════════════");
    console.log(" FoodNearMe x402 Phase B — agent pays for signed attestation");
    console.log(" (local mock facilitator — not live mainnet settlement)");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");

    console.log("1) Agent calls get_safety_attestation (free quota = 1/day)");
    const free = await evaluatePaidAccess({
      resource: "get_safety_attestation",
      clientIp,
    });
    console.log(`   → ${free.kind} (quota consumed)`);
    console.log("");

    console.log("2) Agent retries — over quota, no X-PAYMENT");
    const challenged = await evaluatePaidAccess({
      resource: "get_safety_attestation",
      clientIp,
    });
    if (challenged.kind !== "challenge") {
      throw new Error(`expected challenge, got ${challenged.kind}`);
    }
    const challenge = challenged.challenge;
    console.log("   → payment_required / HTTP 402");
    console.log(`   x402Version: ${challenge.x402Version}`);
    console.log(`   accepts[0].scheme: ${challenge.accepts[0]?.scheme}`);
    console.log(`   accepts[0].network: ${challenge.accepts[0]?.network}`);
    console.log(`   accepts[0].maxAmountRequired: ${challenge.accepts[0]?.maxAmountRequired}`);
    console.log(`   accepts[0].resource: ${challenge.accepts[0]?.resource}`);
    console.log(`   accepts[0].extra.status: ${challenge.accepts[0]?.extra?.status}`);
    console.log("");
    console.log(format402Message(challenge).split("\n").map((l) => `   ${l}`).join("\n"));
    console.log("");

    console.log("3) Agent constructs mock X-PAYMENT (EIP-3009-shaped payload)");
    const requirements = buildPaymentChallenge({ resource: "get_safety_attestation" }).accepts[0]!;
    const payment = buildMockPaymentPayload(requirements);
    const paymentHeader = encodePaymentHeader(payment);
    console.log(`   X-PAYMENT length: ${paymentHeader.length} chars (base64)`);
    console.log(`   authorization.value: ${payment.payload.authorization.value}`);
    console.log(`   authorization.to: ${payment.payload.authorization.to}`);
    console.log("");

    console.log("4) Agent retries with X-PAYMENT → verify + settle (mock)");
    const paid = await evaluatePaidAccess({
      resource: "get_safety_attestation",
      clientIp,
      paymentHeader,
    });
    if (paid.kind !== "allow" || !paid.settlement) {
      throw new Error(`expected allow+settlement, got ${paid.kind}`);
    }
    console.log("   → allow");
    console.log(`   settlement_id: ${paid.settlement.settlement_id}`);
    console.log(`   transaction:   ${paid.settlement.transaction}`);
    console.log(`   facilitator:   ${paid.settlement.facilitator}`);
    console.log(`   X-PAYMENT-RESPONSE would carry this receipt`);
    console.log("");

    console.log("5) Server returns signed fnm-safety-v1 attestation");
    const attestation = buildSafetyAttestation(
      {
        restaurant_id: restaurantId,
        tier: "strong_protocol",
        as_of: asOf,
        allergy_needs: ["peanut", "tree_nut"],
        allergy_safety_note: "Dedicated fryer + labeled prep for demo transcript",
      },
      { signingKey },
    );

    if (!attestation.attestation) {
      throw new Error("expected signed attestation for curated tier");
    }

    const sig = attestation.attestation;
    console.log(`   scheme:          ${sig.scheme}`);
    console.log(`   safety_tier:     ${attestation.safety_tier}`);
    console.log(`   key_fingerprint: ${sig.key_fingerprint}`);
    console.log(`   signature:       ${sig.signature.slice(0, 40)}…`);
    console.log("");

    const expectedCanonical = canonicalizeSafetyClaim({
      restaurant_id: restaurantId,
      tier: "strong_protocol",
      as_of: asOf,
      key_fingerprint: sig.key_fingerprint,
    });
    if (sig.canonical !== expectedCanonical) {
      throw new Error("canonical mismatch");
    }
    if (sig.scheme !== SAFETY_ATTESTATION_SCHEME) {
      throw new Error(`unexpected scheme ${sig.scheme}`);
    }

    const ok = verifyMenuSignature(sig.hash, sig.signature, signingKey.publicKeyPem);
    console.log(`6) Verifier check against demo public key: ${ok ? "PASS" : "FAIL"}`);
    if (!ok) throw new Error("attestation signature failed verification");

    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(" Transcript complete: agent paid (mock) → signed attestation");
    console.log("═══════════════════════════════════════════════════════════");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
