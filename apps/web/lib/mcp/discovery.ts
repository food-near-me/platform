/**
 * Static `GET /mcp` discovery payload.
 *
 * MCP clients that don't speak JSON-RPC (or that want a quick health
 * check before initializing) hit `GET /mcp`. The body is small,
 * cacheable, and changes only when the tool catalogue does — keep it
 * derived from `SERVER_INFO` / `TOOLS` / `RESOURCES` so it stays in sync
 * automatically.
 */

import { RESOURCES } from "./resources";
import { SERVER_INFO, TOOLS } from "./server-info";

export function buildMcpDiscoveryPayload() {
  return {
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocol: "MCP",
    protocolVersion: SERVER_INFO.protocolVersion,
    status: "healthy",
    description:
      "foodnear.me MCP server for AI agent restaurant discovery. Search for restaurants, get Menu Protocol formatted menus, and check ADO scores.",

    capabilities: SERVER_INFO.capabilities,

    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      required_params: t.inputSchema.required,
    })),

    resources: RESOURCES.map((r) => ({
      uri: r.uri,
      name: r.name,
      mimeType: r.mimeType,
    })),

    endpoints: {
      rpc: "POST /mcp",
      discovery: "GET /mcp",
      rest_api: "GET /api/v1/*",
    },

    documentation: {
      skill_file: "https://foodnear.me/SKILL.md",
      openapi: "https://foodnear.me/openapi.json",
      agent_metadata: "https://foodnear.me/.well-known/agent.json",
    },

    usage: {
      example_initialize: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      },
      example_tool_call: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "search_restaurants",
          arguments: {
            lat: 40.7128,
            lng: -74.006,
            query: "thai",
            dietary: ["vegan"],
          },
        },
      },
    },
  } as const;
}
