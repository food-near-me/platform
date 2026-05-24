#!/usr/bin/env npx tsx
/**
 * Verify FNM_MCP_ENABLED_TOOLS filters tools/list, GET /mcp discovery, and
 * disabled tools/call responses.
 */

import { buildMcpDiscoveryPayload } from "../lib/mcp/discovery";
import { RPC_ERRORS } from "../lib/mcp/constants";
import { handleRpcRequest } from "../lib/mcp/rpc";

const ENV_NAME = "FNM_MCP_ENABLED_TOOLS";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function main() {
  const previous = process.env[ENV_NAME];
  try {
    process.env[ENV_NAME] = "search_restaurants";

    const toolsList = (await handleRpcRequest("tools/list")) as {
      tools: Array<{ name: string }>;
    };
    const names = toolsList.tools.map((tool) => tool.name);
    assert(
      names.length === 1 && names[0] === "search_restaurants",
      `Expected only search_restaurants in tools/list, got ${names.join(", ")}`,
    );

    const discovery = buildMcpDiscoveryPayload() as {
      tools: Array<{ name: string }>;
    };
    const discoveryNames = discovery.tools.map((tool) => tool.name);
    assert(
      discoveryNames.length === 1 && discoveryNames[0] === "search_restaurants",
      `Expected only search_restaurants in discovery, got ${discoveryNames.join(", ")}`,
    );

    try {
      await handleRpcRequest("tools/call", {
        name: "get_restaurant",
        arguments: { restaurant_id: "00000000-0000-0000-0000-000000000000" },
      });
      throw new Error("Expected disabled get_restaurant call to throw");
    } catch (error) {
      const maybe = error as { code?: number; message?: string };
      assert(
        maybe.code === RPC_ERRORS.METHOD_NOT_FOUND.code,
        `Expected METHOD_NOT_FOUND, got ${maybe.code ?? "(missing code)"}`,
      );
      assert(
        typeof maybe.message === "string" && maybe.message.includes(ENV_NAME),
        "Disabled-tool error must name FNM_MCP_ENABLED_TOOLS",
      );
    }

    process.env[ENV_NAME] = "*";
    const allTools = (await handleRpcRequest("tools/list")) as {
      tools: Array<{ name: string }>;
    };
    assert(allTools.tools.length >= 5, "Expected '*' to expose all tools");

    console.log("OK  FNM_MCP_ENABLED_TOOLS filters tools/list, discovery, and disabled calls");
  } finally {
    if (previous === undefined) delete process.env[ENV_NAME];
    else process.env[ENV_NAME] = previous;
  }
}

main().catch((error) => {
  console.error("[test:mcp-tool-filtering] FAIL:", error instanceof Error ? error.message : error);
  process.exit(1);
});
