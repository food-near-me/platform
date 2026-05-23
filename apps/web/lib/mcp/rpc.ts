/**
 * JSON-RPC 2.0 dispatch for the MCP server.
 *
 * `handleRpcRequest(method, params)` is the single entry point used by both
 * single and batch HTTP requests. It returns the JSON-RPC `result` value;
 * the HTTP layer wraps it into `{ jsonrpc, id, result }`. Protocol errors
 * are thrown as plain `RpcError` objects (use `isRpcError` to detect them)
 * so the HTTP layer can place them on the `error` field with the right
 * status code.
 *
 * Tool-level errors are caught here, translated to structured tool-error
 * results via `lib/mcp/tool-errors.ts`, and recorded to `mcp_invocations`
 * so the `/api/health/mcp` rollup stays accurate.
 */

import { handleGetPrompt, promptDefinitions } from "@/lib/mcp/prompts";
import {
  extractResultsCount,
  extractTierLabel,
  recordMcpInvocation,
} from "@/lib/mcp/instrumentation";
import { toolErrorResult } from "@/lib/mcp/tool-errors";

import { RPC_ERRORS } from "./constants";
import {
  ResourceNotFoundError,
  ValidationError,
  makeRpcError,
} from "./errors";
import { RESOURCES, RESOURCE_CONTENT } from "./resources";
import { SERVER_INFO, TOOLS } from "./server-info";
import { getAdoScoreBreakdown } from "./tools/ado";
import { getMenu } from "./tools/menu";
import { getRestaurant } from "./tools/restaurant";
import { searchRestaurants } from "./tools/search";
import { validateMenuProtocol } from "./tools/validate";

/**
 * Dispatch table for `tools/call`. Each entry returns the raw tool result
 * object, which the caller wraps into the MCP `{ content, isError }` envelope.
 *
 * Synchronous tools are wrapped to keep the dispatcher uniform.
 */
const TOOL_DISPATCH: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  search_restaurants: (args) => searchRestaurants(args),
  get_restaurant: (args) => getRestaurant(args),
  get_menu: (args) => getMenu(args),
  get_ado_score_breakdown: (args) => getAdoScoreBreakdown(args),
  validate_menu_protocol: async (args) => validateMenuProtocol(args),
};

async function handleToolCall(params: unknown): Promise<unknown> {
  if (!params || typeof params !== "object") {
    throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "params required for tools/call");
  }

  const { name, arguments: toolArgs } = params as {
    name?: string;
    arguments?: Record<string, unknown>;
  };

  if (!name || typeof name !== "string") {
    throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "tool name required");
  }

  const dispatcher = TOOL_DISPATCH[name];
  if (!dispatcher) {
    throw makeRpcError(RPC_ERRORS.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  }

  const args = toolArgs || {};
  const toolStart = Date.now();

  try {
    const result = await dispatcher(args);

    void recordMcpInvocation({
      toolName: name,
      status: "success",
      tierReturned: extractTierLabel(result),
      resultsCount: extractResultsCount(result),
      durationMs: Date.now() - toolStart,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: false,
    };
  } catch (err) {
    const durationMs = Date.now() - toolStart;
    if (err instanceof ValidationError) {
      void recordMcpInvocation({
        toolName: name,
        status: "error",
        errorCode: "VALIDATION_ERROR",
        durationMs,
      });
      return toolErrorResult({
        code: "VALIDATION_ERROR",
        message: err.message,
        hint: err.hint,
        retryable: false,
      });
    }
    if (err instanceof ResourceNotFoundError) {
      void recordMcpInvocation({
        toolName: name,
        status: "error",
        errorCode: "NOT_FOUND",
        durationMs,
      });
      return toolErrorResult({
        code: "NOT_FOUND",
        message: err.message,
        hint: err.hint ?? "Use search_restaurants to find a valid restaurant_id.",
        retryable: false,
      });
    }
    console.error(`MCP tool ${name} error:`, err);
    void recordMcpInvocation({
      toolName: name,
      status: "error",
      errorCode: "UPSTREAM",
      durationMs,
    });
    return toolErrorResult({
      code: "UPSTREAM",
      message: err instanceof Error ? err.message : "An unexpected error occurred",
      hint: "Retry the request. If the problem persists, check service status.",
      retryable: true,
    });
  }
}

function handleResourcesRead(params: unknown): unknown {
  if (!params || typeof params !== "object") {
    throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "params required for resources/read");
  }

  const { uri } = params as { uri?: string };

  if (!uri || typeof uri !== "string") {
    throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "uri required");
  }

  const content = RESOURCE_CONTENT[uri];
  if (!content) {
    throw makeRpcError(RPC_ERRORS.RESOURCE_NOT_FOUND, `Unknown resource: ${uri}`);
  }

  const resource = RESOURCES.find((r) => r.uri === uri);

  return {
    contents: [
      {
        uri,
        mimeType: resource?.mimeType || "text/plain",
        text: content,
      },
    ],
  };
}

function handlePromptsGet(params: unknown): unknown {
  if (!params || typeof params !== "object") {
    throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "params required for prompts/get");
  }

  const { name, arguments: promptArgs } = params as {
    name?: string;
    arguments?: Record<string, string>;
  };

  if (!name || typeof name !== "string") {
    throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, "prompt name required");
  }

  try {
    return handleGetPrompt(name, promptArgs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      throw makeRpcError(RPC_ERRORS.METHOD_NOT_FOUND, message);
    }
    throw makeRpcError(RPC_ERRORS.INVALID_PARAMS, message);
  }
}

export async function handleRpcRequest(method: string, params?: unknown): Promise<unknown> {
  switch (method) {
    case "initialize":
      return SERVER_INFO;

    case "notifications/initialized":
      // Client notification - no response needed.
      return null;

    case "tools/list":
      return { tools: TOOLS };

    case "tools/call":
      return handleToolCall(params);

    case "resources/list":
      return { resources: RESOURCES };

    case "resources/read":
      return handleResourcesRead(params);

    case "prompts/list":
      return { prompts: promptDefinitions };

    case "prompts/get":
      return handlePromptsGet(params);

    case "ping":
      return { pong: true };

    default:
      throw makeRpcError(RPC_ERRORS.METHOD_NOT_FOUND, method);
  }
}
