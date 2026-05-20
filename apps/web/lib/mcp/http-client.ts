import {
  parseMcpToolResult,
  type McpFlowClient,
  type McpPromptResult,
  type McpToolCallResult,
} from "./mcp-flow-runner";

type JsonRpcResponse = {
  jsonrpc: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export function createHttpMcpClient(baseUrl: string): McpFlowClient {
  const base = baseUrl.replace(/\/$/, "");
  let requestId = 1;

  async function jsonRpc(method: string, params?: unknown): Promise<unknown> {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id: requestId++,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from POST /mcp (${method})`);
    }

    const data = (await res.json()) as JsonRpcResponse;
    if (data.error) {
      throw new Error(`JSON-RPC error ${data.error.code}: ${data.error.message}`);
    }

    return data.result;
  }

  return {
    listTools: async () => {
      const result = (await jsonRpc("tools/list")) as { tools: Array<{ name: string }> };
      return result.tools.map((t) => t.name);
    },
    listResources: async () => {
      const result = (await jsonRpc("resources/list")) as { resources: Array<{ uri: string }> };
      return result.resources.map((r) => r.uri);
    },
    listPrompts: async () => {
      const result = (await jsonRpc("prompts/list")) as { prompts: Array<{ name: string }> };
      return result.prompts.map((p) => p.name);
    },
    getPrompt: async (name, args) => {
      const result = (await jsonRpc("prompts/get", { name, arguments: args })) as McpPromptResult;
      return result;
    },
    callTool: async (name, args): Promise<McpToolCallResult> => {
      const result = await jsonRpc("tools/call", { name, arguments: args });
      return parseMcpToolResult(result);
    },
  };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
