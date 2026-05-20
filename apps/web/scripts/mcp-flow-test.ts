#!/usr/bin/env npx tsx
/**
 * Run automated MCP agent flows against foodnear.me /mcp.
 *
 * Usage:
 *   npx tsx scripts/mcp-flow-test.ts
 *   npx tsx scripts/mcp-flow-test.ts --url=http://localhost:3000
 *   MCP_URL=https://foodnear.me npx tsx scripts/mcp-flow-test.ts
 *
 * Requires dev server running for localhost, or production/staging URL.
 * See: apps/web/docs/example-agent-flows.md
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { createHttpMcpClient, isSupabaseConfigured } from "../lib/mcp/http-client";
import {
  runMcpFlows,
  formatFlowReport,
  exitCodeFromResults,
} from "../lib/mcp/mcp-flow-runner";

function parseArgs(argv: string[]) {
  let url = process.env.MCP_URL ?? "http://localhost:3000";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url" && argv[i + 1]) {
      url = argv[++i];
    } else if (arg.startsWith("--url=")) {
      url = arg.slice("--url=".length);
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npx tsx scripts/mcp-flow-test.ts [--url BASE_URL]`);
      console.log(`Base URL or MCP endpoint accepted (POST {url}/mcp when needed)`);
      process.exit(0);
    }
  }

  return { url: url.replace(/\/$/, "") };
}

async function main() {
  const { url } = parseArgs(process.argv.slice(2));
  const endpoint = url.endsWith("/mcp") ? url : `${url}/mcp`;
  console.log(`[mcp-flow-test] url=${endpoint}`);

  if (!isSupabaseConfigured()) {
    console.warn("[mcp-flow-test] Supabase env not set locally — DB flows will be skipped");
  }

  try {
    const client = createHttpMcpClient(url);
    const results = await runMcpFlows(client, {
      databaseAvailable: isSupabaseConfigured(),
    });

    // Treat SKIP messages in fail as skip for nicer reporting
    for (const r of results) {
      if (r.status === "fail" && r.message?.startsWith("SKIP:")) {
        r.status = "skip";
        r.message = r.message.replace(/^SKIP:\s*/, "");
      }
    }

    console.log(formatFlowReport(results));
    process.exit(exitCodeFromResults(results));
  } catch (error) {
    console.error("[mcp-flow-test] Fatal:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
