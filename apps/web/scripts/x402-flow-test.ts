#!/usr/bin/env npx tsx
/**
 * Run Phase A x402 guard flow tests (unit + optional HTTP against live server).
 *
 * Usage:
 *   npm run test:x402-flows
 *   npm run test:x402-flows -- --http --url=http://localhost:3000
 *
 * HTTP integration requires the dev server running with:
 *   FNM_X402_ENABLED=1
 *   FNM_X402_FREE_QUOTA_PER_DAY=2   (optional, lower for faster test)
 */

import {
  runX402Flows,
  runX402HttpFlow,
  formatFlowReport,
  exitCodeFromResults,
  type FlowResult,
} from "../lib/x402/x402-flow-runner";

function parseArgs(argv: string[]) {
  let url = process.env.MCP_URL ?? "http://localhost:3000";
  let http = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url" && argv[i + 1]) {
      url = argv[++i];
    } else if (arg === "--http") {
      http = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npx tsx scripts/x402-flow-test.ts [--http] [--url BASE_URL]`);
      process.exit(0);
    }
  }

  return { url: url.replace(/\/$/, ""), http };
}

async function main() {
  const { url, http } = parseArgs(process.argv.slice(2));

  console.log("[x402-flow-test] Phase A guard tests");

  const results: FlowResult[] = await runX402Flows();

  if (http) {
    console.log(`[x402-flow-test] HTTP integration against ${url}`);
    const httpResult = await runX402HttpFlow(url);
    if (httpResult.status === "fail" && httpResult.message?.startsWith("SKIP:")) {
      httpResult.status = "skip";
      httpResult.message = httpResult.message.replace(/^SKIP:\s*/, "");
    }
    results.push(httpResult);
  }

  console.log(formatFlowReport(results));
  process.exit(exitCodeFromResults(results));
}

main();
