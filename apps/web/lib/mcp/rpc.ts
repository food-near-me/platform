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

import type { ZodIssue, ZodTypeAny } from "zod";

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
import { TOOL_INPUT_SCHEMAS, type ToolName } from "./tools/inputs";

/**
 * Dispatch table for `tools/call`. Each entry takes the Zod-parsed,
 * typed input for its tool and returns the raw tool result object, which
 * the caller wraps into the MCP `{ content, isError }` envelope.
 *
 * Synchronous tools are wrapped to keep the dispatcher uniform. The
 * `unknown` arg type at the dispatcher boundary is safe because parsing
 * happens immediately via `TOOL_INPUT_SCHEMAS[name].parse(...)`; the
 * inner tool implementations receive precise types from their inputs
 * schema.
 */
const TOOL_DISPATCH: Record<ToolName, (input: never) => Promise<unknown>> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  search_restaurants: ((input: any) => searchRestaurants(input)) as (input: never) => Promise<unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get_restaurant: ((input: any) => getRestaurant(input)) as (input: never) => Promise<unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get_menu: ((input: any) => getMenu(input)) as (input: never) => Promise<unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get_ado_score_breakdown: ((input: any) => getAdoScoreBreakdown(input)) as (
    input: never,
  ) => Promise<unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validate_menu_protocol: (async (input: any) => validateMenuProtocol(input)) as (
    input: never,
  ) => Promise<unknown>,
};

function isKnownToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_INPUT_SCHEMAS, name);
}

function formatZodIssue(issue: ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  return `${path}: ${issue.message}`;
}

/**
 * Translate Zod input failures into the same `ValidationError` shape the
 * old hand-rolled validators threw, so the downstream `toolErrorResult`
 * code path stays unchanged.
 */
function parseToolInput<S extends ZodTypeAny>(
  schema: S,
  rawArgs: unknown,
  toolName: ToolName,
): ReturnType<S["parse"]> {
  const result = schema.safeParse(rawArgs ?? {});
  if (!result.success) {
    const issues = result.error.issues;
    const primary = issues[0];
    const message = formatZodIssue(primary);
    const remaining = issues.length > 1 ? ` (+${issues.length - 1} more issue(s))` : "";
    const hint =
      `Tool ${toolName} expects validated input. ` +
      `Inspect the JSON schema in tools/list for the canonical shape.${remaining}`;
    throw new ValidationError(message, hint);
  }
  return result.data as ReturnType<S["parse"]>;
}

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

  if (!isKnownToolName(name)) {
    throw makeRpcError(RPC_ERRORS.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  }

  const toolStart = Date.now();

  try {
    const parsed = parseToolInput(TOOL_INPUT_SCHEMAS[name], toolArgs, name);
    const dispatcher = TOOL_DISPATCH[name];
    const result = await dispatcher(parsed as never);

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
