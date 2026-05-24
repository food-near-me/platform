#!/usr/bin/env npx tsx
/**
 * Lightweight MCP smoke probes after deploy.
 * Complements deploy-preflight.sh with tools/list + resources/list parity.
 *
 * Usage:
 *   BASE_URL=https://foodnear.me npm run smoke:mcp
 *   npx tsx scripts/mcp-smoke-probes.ts --base http://localhost:3000
 */

import {
  EXPECTED_MCP_TOOLS,
  EXPECTED_MCP_RESOURCES,
  EXPECTED_MCP_PROMPTS,
} from "../lib/mcp/mcp-flow-runner";

type JsonRpcResponse = {
  result?: unknown;
  error?: { message: string };
};

type McpTool = {
  name: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

function parseArgs(argv: string[]) {
  let base = process.env.BASE_URL ?? "https://foodnear.me";
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--base" || argv[i] === "--url") && argv[i + 1]) {
      base = argv[++i];
    }
  }
  return base.replace(/\/$/, "");
}

function assertSortedEqual(actual: string[], expected: readonly string[], label: string) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (a.length !== e.length) {
    throw new Error(`${label}: expected ${e.length}, got ${a.length}`);
  }
  for (let i = 0; i < e.length; i++) {
    if (a[i] !== e[i]) {
      throw new Error(`${label} mismatch: expected ${e[i]}, got ${a[i]}`);
    }
  }
}

async function jsonRpc(base: string, method: string, params: unknown = {}): Promise<unknown> {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  if (!res.ok) {
    throw new Error(`POST /mcp ${method} returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as JsonRpcResponse;
  if (data.error) {
    throw new Error(`JSON-RPC ${method}: ${data.error.message}`);
  }
  return data.result;
}

async function checkDiscoveryManifest(base: string) {
  const res = await fetch(`${base}/.well-known/mcp-server.json`);
  if (!res.ok) {
    throw new Error(`mcp-server.json returned ${res.status}`);
  }
  const data = (await res.json()) as { tools?: Array<{ name: string }> };
  if (!Array.isArray(data.tools)) {
    throw new Error("mcp-server.json missing tools array");
  }
  const names = data.tools.map((t) => t.name);
  assertSortedEqual(names, EXPECTED_MCP_TOOLS, "discovery tools");
  console.log("OK  discovery  /.well-known/mcp-server.json tool parity");
}

function assertToolAnnotations(tools: McpTool[]) {
  for (const tool of tools) {
    const annotations = tool.annotations;
    if (!annotations) {
      throw new Error(`${tool.name}: missing annotations`);
    }
    if (
      annotations.readOnlyHint !== true ||
      annotations.destructiveHint !== false ||
      annotations.idempotentHint !== false ||
      annotations.openWorldHint !== false
    ) {
      throw new Error(`${tool.name}: unexpected annotations ${JSON.stringify(annotations)}`);
    }
  }
}

async function main() {
  const base = parseArgs(process.argv.slice(2));
  console.log(`[smoke:mcp] base=${base}`);
  console.log("================================");

  try {
    await checkDiscoveryManifest(base);

    const toolsResult = (await jsonRpc(base, "tools/list")) as { tools: McpTool[] };
    const toolNames = toolsResult.tools.map((t) => t.name);
    assertSortedEqual(toolNames, EXPECTED_MCP_TOOLS, "tools/list");
    assertToolAnnotations(toolsResult.tools);
    console.log(`OK  tools/list  ${toolNames.length} tools`);

    const resourcesResult = (await jsonRpc(base, "resources/list")) as {
      resources: Array<{ uri: string }>;
    };
    const uris = resourcesResult.resources.map((r) => r.uri);
    assertSortedEqual(uris, EXPECTED_MCP_RESOURCES, "resources/list");
    console.log(`OK  resources/list  ${uris.length} resources`);

    const promptsResult = (await jsonRpc(base, "prompts/list")) as {
      prompts: Array<{ name: string }>;
    };
    const promptNames = promptsResult.prompts.map((p) => p.name);
    assertSortedEqual(promptNames, EXPECTED_MCP_PROMPTS, "prompts/list");
    console.log(`OK  prompts/list  ${promptNames.length} prompts`);

    console.log("");
    console.log("All MCP smoke probes passed.");
    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("[smoke:mcp] FAIL:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
