/**
 * Phase A x402 flow tests — guard + 402 response shape (no settlement).
 */

import { checkX402Access } from "./guard";
import type { PaymentRequiredBody } from "./types";

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
  fn: () => void | Promise<void>
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
  fn: () => void | Promise<void>
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
  siwx?: string;
  url?: string;
}): Request {
  const headers = new Headers();
  if (options.ip) headers.set("x-forwarded-for", options.ip);
  if (options.authorization) headers.set("authorization", options.authorization);
  if (options.siwx) headers.set("x-sign-in-with-x", options.siwx);

  return new Request(options.url ?? "http://localhost/api/v1/search?lat=40.7&lng=-74", {
    headers,
  });
}

async function parse402(response: Response): Promise<PaymentRequiredBody> {
  assert(response.status === 402, `expected 402, got ${response.status}`);
  const body = (await response.json()) as PaymentRequiredBody;
  assert(body.error === "payment_required", "body.error must be payment_required");
  return body;
}

export async function runX402Flows(): Promise<FlowResult[]> {
  const results: FlowResult[] = [];

  results.push(
    await runFlow("x402-disabled", "x402 disabled passes through", async () => {
      await withEnv({ FNM_X402_ENABLED: undefined }, async () => {
        const response = await checkX402Access(
          makeRequest({ ip: `disabled-${Date.now()}` }),
          "search"
        );
        assert(response === null, "expected null when x402 disabled");
      });
    })
  );

  results.push(
    await runFlow("x402-under-quota", "under free quota allowed", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_FREE_QUOTA_PER_DAY: "5",
        },
        async () => {
          const ip = `under-quota-${Date.now()}`;
          const response = await checkX402Access(makeRequest({ ip }), "search");
          assert(response === null, "first request under quota should pass");
        }
      );
    })
  );

  results.push(
    await runFlow("x402-over-quota-402", "over quota returns structured 402", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_FREE_QUOTA_PER_DAY: "1",
        },
        async () => {
          const ip = `over-quota-${Date.now()}`;

          const first = await checkX402Access(makeRequest({ ip }), "search");
          assert(first === null, "first request should pass");

          const second = await checkX402Access(makeRequest({ ip }), "search");
          assert(second !== null, "second request should be blocked");

          const body = await parse402(second as Response);
          assert(body.payment_options.length > 0, "payment_options required");
          assert(body.auth_options.api_key.header.includes("Bearer"), "api_key header");
          assert(
            body.auth_options.x402_wallet.header === "X-Sign-In-With-X",
            "x402_wallet header"
          );
          assert(
            body.auth_options.x402_wallet.status === "phase_a_guard_only",
            "x402_wallet.status should be phase_a_guard_only without FNM_X402_TOPUP_ENDPOINT"
          );
          assert(
            body.auth_options.x402_wallet.top_up_endpoint === undefined,
            "top_up_endpoint must be omitted until Phase B route is shipped"
          );
          assert(second!.headers.get("X-Payment-Required") === "x402", "X-Payment-Required header");
        }
      );
    })
  );

  results.push(
    await runFlow("x402-bearer-bypass", "Bearer auth bypasses quota", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_FREE_QUOTA_PER_DAY: "1",
        },
        async () => {
          const ip = `bearer-${Date.now()}`;

          await checkX402Access(makeRequest({ ip }), "search");
          await checkX402Access(makeRequest({ ip }), "search");

          const withAuth = await checkX402Access(
            makeRequest({ ip, authorization: "Bearer test-key-phase-a" }),
            "search"
          );
          assert(withAuth === null, "Bearer auth should bypass quota");
        }
      );
    })
  );

  results.push(
    await runFlow("x402-siwx-bypass", "SIWX header bypasses quota", async () => {
      await withEnv(
        {
          FNM_X402_ENABLED: "1",
          FNM_X402_FREE_QUOTA_PER_DAY: "1",
        },
        async () => {
          const ip = `siwx-${Date.now()}`;

          await checkX402Access(makeRequest({ ip }), "restaurant");
          await checkX402Access(makeRequest({ ip }), "restaurant");

          const withSiwx = await checkX402Access(
            makeRequest({ ip, siwx: "phase-a-stub-token" }),
            "restaurant"
          );
          assert(withSiwx === null, "SIWX auth should bypass quota");
        }
      );
    })
  );

  results.push(
    await runFlow(
      "x402-topup-when-configured",
      "top_up_endpoint surfaces when FNM_X402_TOPUP_ENDPOINT is set",
      async () => {
        await withEnv(
          {
            FNM_X402_ENABLED: "1",
            FNM_X402_FREE_QUOTA_PER_DAY: "1",
            FNM_X402_TOPUP_ENDPOINT: "/api/v1/x402/top-up",
          },
          async () => {
            const ip = `topup-${Date.now()}`;
            await checkX402Access(makeRequest({ ip }), "search");
            const blocked = await checkX402Access(makeRequest({ ip }), "search");
            assert(blocked !== null, "second request should be blocked");
            const body = await parse402(blocked as Response);
            assert(
              body.auth_options.x402_wallet.top_up_endpoint === "/api/v1/x402/top-up",
              "top_up_endpoint should advertise configured value"
            );
            assert(
              body.auth_options.x402_wallet.status === "phase_b_settlement",
              "status should flip to phase_b_settlement when route is configured"
            );
          }
        );
      }
    )
  );

  return results;
}

export async function runX402HttpFlow(baseUrl: string): Promise<FlowResult> {
  return runFlow("x402-http-over-quota", "HTTP search returns 402 when enabled", async () => {
    const ip = `http-test-${Date.now()}`;
    const searchUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/search?lat=40.7128&lng=-74.006&radius=5`;
    const headers = { "x-forwarded-for": ip };

    // Start dev server with FNM_X402_ENABLED=1 and FNM_X402_FREE_QUOTA_PER_DAY=2
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
      "SKIP: no 402 after 3 requests — start server with FNM_X402_ENABLED=1 FNM_X402_FREE_QUOTA_PER_DAY=2"
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
