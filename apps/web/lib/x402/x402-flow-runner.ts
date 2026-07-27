/**
 * Phase B x402 flow tests — free quota, canonical 402 challenge, mock
 * verify+settle loop, paywall dial, API-key bypass.
 */

import { buildPaymentChallenge } from "./challenge";
import { checkX402Access, evaluatePaidAccess } from "./guard";
import {
  buildMockPaymentPayload,
  decodePaymentResponseHeader,
  encodePaymentHeader,
} from "./payment";
import type { PaymentRequirementsResponse } from "./types";

export type FlowStatus = "pass" | "fail" | "skip";

export type FlowResult = {
  id: string;
  name: string;
  status: FlowStatus;
  message?: string;
  durationMs: number;
};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function runFlow(
  id: string,
  name: string,
  fn: () => void | Promise<void>,
): Promise<FlowResult> {
  const start = performance.now();
  try {
    await fn();
    return { id, name, status: "pass", durationMs: Math.round(performance.now() - start) };
  } catch (error) {
    return {
      id,
      name,
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - start),
    };
  }
}

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
): void | Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const run = async () => {
    try {
      await fn();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };

  return run();
}

function makeRequest(options: {
  ip?: string;
  authorization?: string;
  payment?: string;
  url?: string;
}): Request {
  const headers = new Headers();
  if (options.ip) headers.set("x-forwarded-for", options.ip);
  if (options.authorization) headers.set("authorization", options.authorization);
  if (options.payment) headers.set("X-PAYMENT", options.payment);

  return new Request(options.url ?? "http://localhost/api/v1/search?lat=40.7&lng=-74", {
    headers,
  });
}

async function parse402(response: Response): Promise<PaymentRequirementsResponse> {
  assert(response.status === 402, `expected 402, got ${response.status}`);
  const body = (await response.json()) as PaymentRequirementsResponse;
  assert(body.x402Version === 1, "x402Version must be 1");
  assert(Array.isArray(body.accepts) && body.accepts.length > 0, "accepts[] required");
  return body;
}

export async function runX402Flows(): Promise<FlowResult[]> {
  const results: FlowResult[] = [];

  results.push(
    await runFlow("x402-disabled", "x402 disabled passes through", async () => {
      await withEnv({ FNM_X402_ENABLED: undefined }, async () => {
        const access = await checkX402Access(
          makeRequest({ ip: `disabled-${Date.now()}` }),
          "get_safety_attestation",
        );
        assert(access.status === "allow", "expected allow when x402 disabled");
        if (access.status === "allow") {
          assert(!access.settlement, "no settlement when disabled");
        }
      });
    }),
  );

  results.push(
    await runFlow("x402-unpaid-resource-free", "non-paid resource free when enabled", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_PAID_RESOURCES: "get_safety_attestation",
          FNM_X402_FREE_QUOTA_PER_DAY: "1",
        },
        async () => {
          const ip = `unpaid-${Date.now()}`;
          // Exhaust a quota key that would matter if search were paid — still free.
          const first = await checkX402Access(makeRequest({ ip }), "search");
          const second = await checkX402Access(makeRequest({ ip }), "search");
          assert(first.status === "allow" && second.status === "allow", "search stays free");
        },
      );
    }),
  );

  results.push(
    await runFlow("x402-under-quota", "under free quota allowed for paid resource", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_PAID_RESOURCES: "get_safety_attestation",
          FNM_X402_FREE_QUOTA_PER_DAY: "5",
        },
        async () => {
          const outcome = await evaluatePaidAccess({
            resource: "get_safety_attestation",
            clientIp: `under-quota-${Date.now()}`,
          });
          assert(outcome.kind === "allow", "first request under quota should pass");
        },
      );
    }),
  );

  results.push(
    await runFlow("x402-over-quota-402", "over quota returns canonical accepts[]", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_PAID_RESOURCES: "get_safety_attestation",
          FNM_X402_FREE_QUOTA_PER_DAY: "1",
          FNM_X402_FACILITATOR: "mock",
        },
        async () => {
          const ip = `over-quota-${Date.now()}`;

          const first = await evaluatePaidAccess({
            resource: "get_safety_attestation",
            clientIp: ip,
          });
          assert(first.kind === "allow", "first request should pass");

          const second = await checkX402Access(
            makeRequest({ ip }),
            "get_safety_attestation",
          );
          assert(second.status === "deny", "second request should be blocked");
          if (second.status !== "deny") throw new Error("unreachable");

          const body = await parse402(second.response);
          const req = body.accepts[0]!;
          assert(req.scheme === "exact", "scheme exact");
          assert(typeof req.maxAmountRequired === "string", "maxAmountRequired");
          assert(req.asset.startsWith("0x"), "USDC asset address");
          assert(req.payTo.startsWith("0x"), "payTo address");
          assert(req.extra?.status === "mock_facilitator", "mock status");
          assert(req.extra?.facilitator === "mock", "mock facilitator");
          assert(
            second.response.headers.get("X-Payment-Required") === "x402",
            "X-Payment-Required header",
          );
          assert(
            body.error.toLowerCase().includes("mock"),
            "error text must disclose mock facilitator",
          );
        },
      );
    }),
  );

  results.push(
    await runFlow("x402-pay-settle-loop", "mock X-PAYMENT verify+settle unlocks", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_PAID_RESOURCES: "get_safety_attestation",
          FNM_X402_FREE_QUOTA_PER_DAY: "1",
          FNM_X402_FACILITATOR: "mock",
        },
        async () => {
          const ip = `pay-loop-${Date.now()}`;

          await evaluatePaidAccess({ resource: "get_safety_attestation", clientIp: ip });

          const challenge = buildPaymentChallenge({ resource: "get_safety_attestation" });
          const payment = buildMockPaymentPayload(challenge.accepts[0]!);
          const header = encodePaymentHeader(payment);

          const paid = await evaluatePaidAccess({
            resource: "get_safety_attestation",
            clientIp: ip,
            paymentHeader: header,
          });
          assert(paid.kind === "allow", "paid request should allow");
          if (paid.kind !== "allow") throw new Error("unreachable");
          assert(paid.settlement?.success === true, "settlement success");
          assert(
            paid.settlement?.transaction.startsWith("mock:"),
            "mock tx hash",
          );
          assert(
            Boolean(paid.settlement?.settlement_id?.startsWith("mock_")),
            "settlement_id",
          );
          assert(paid.settlement?.facilitator === "mock", "facilitator label");
        },
      );
    }),
  );

  results.push(
    await runFlow("x402-bad-payment-challenged", "bad X-PAYMENT stays challenged", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_PAID_RESOURCES: "get_safety_attestation",
          FNM_X402_FREE_QUOTA_PER_DAY: "1",
        },
        async () => {
          const ip = `bad-pay-${Date.now()}`;
          await evaluatePaidAccess({ resource: "get_safety_attestation", clientIp: ip });

          const outcome = await evaluatePaidAccess({
            resource: "get_safety_attestation",
            clientIp: ip,
            paymentHeader: "not-a-valid-payment",
          });
          assert(outcome.kind === "challenge", "bad payment must challenge");
        },
      );
    }),
  );

  results.push(
    await runFlow("x402-api-key-bypass", "configured API key bypasses quota", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_PAID_RESOURCES: "get_safety_attestation",
          FNM_X402_FREE_QUOTA_PER_DAY: "1",
          FNM_X402_API_KEY: "phase-b-internal-key",
        },
        async () => {
          const ip = `apikey-${Date.now()}`;
          await evaluatePaidAccess({ resource: "get_safety_attestation", clientIp: ip });

          const blocked = await evaluatePaidAccess({
            resource: "get_safety_attestation",
            clientIp: ip,
          });
          assert(blocked.kind === "challenge", "over quota without key");

          const bypass = await evaluatePaidAccess({
            resource: "get_safety_attestation",
            clientIp: ip,
            authorizationHeader: "Bearer phase-b-internal-key",
          });
          assert(bypass.kind === "allow", "matching API key bypasses");

          const wrong = await evaluatePaidAccess({
            resource: "get_safety_attestation",
            clientIp: ip,
            authorizationHeader: "Bearer wrong-key",
          });
          assert(wrong.kind === "challenge", "wrong key does not bypass");
        },
      );
    }),
  );

  results.push(
    await runFlow("x402-presence-bearer-no-bypass", "presence-only Bearer no longer bypasses", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_PAID_RESOURCES: "get_safety_attestation",
          FNM_X402_FREE_QUOTA_PER_DAY: "1",
          FNM_X402_API_KEY: undefined,
        },
        async () => {
          const ip = `presence-${Date.now()}`;
          await evaluatePaidAccess({ resource: "get_safety_attestation", clientIp: ip });
          const outcome = await evaluatePaidAccess({
            resource: "get_safety_attestation",
            clientIp: ip,
            authorizationHeader: "Bearer anything-nonempty",
          });
          assert(outcome.kind === "challenge", "presence-only Bearer must not bypass");
        },
      );
    }),
  );

  results.push(
    await runFlow("x402-rest-response-header", "REST deny encodes canonical challenge", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_PAID_RESOURCES: "search",
          FNM_X402_FREE_QUOTA_PER_DAY: "1",
        },
        async () => {
          const ip = `rest-${Date.now()}`;
          await checkX402Access(makeRequest({ ip }), "search");
          const denied = await checkX402Access(makeRequest({ ip }), "search");
          assert(denied.status === "deny", "search paid when dialed in");
          if (denied.status !== "deny") throw new Error("unreachable");
          const body = await parse402(denied.response);
          assert(body.accepts[0]?.resource.includes("/api/v1/search"), "resource URI");
        },
      );
    }),
  );

  return results;
}

export async function runX402HttpFlow(baseUrl: string): Promise<FlowResult> {
  return runFlow("x402-http-over-quota", "HTTP paid resource returns 402 when enabled", async () => {
    const ip = `http-test-${Date.now()}`;
    // Attestation is MCP-only; use search with dial override via server env.
    const searchUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/search?lat=40.7128&lng=-74.006&radius=5`;
    const headers = { "x-forwarded-for": ip };

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(searchUrl, { headers });
      if (res.status === 402) {
        await parse402(res);
        return;
      }
      if (res.status !== 200) {
        throw new Error(`unexpected status ${res.status} on attempt ${attempt + 1}`);
      }
    }

    throw new Error(
      "SKIP: no 402 after 3 requests — start server with FNM_X402_ENABLED=1 FNM_X402_PAID_RESOURCES=search FNM_X402_FREE_QUOTA_PER_DAY=2",
    );
  });
}

export function formatFlowReport(results: FlowResult[]): string {
  const lines: string[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of results) {
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "○";
    const suffix = r.message ? ` — ${r.message}` : "";
    lines.push(`${icon} [${r.id}] ${r.name} (${r.durationMs}ms)${suffix}`);
    if (r.status === "pass") passed++;
    else if (r.status === "fail") failed++;
    else skipped++;
  }

  lines.push("");
  lines.push(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return lines.join("\n");
}

export function exitCodeFromResults(results: FlowResult[]): number {
  return results.some((r) => r.status === "fail") ? 1 : 0;
}

/** Re-export for demo scripts that decode receipts. */
export { decodePaymentResponseHeader };
