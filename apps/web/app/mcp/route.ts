/**
 * MCP (Model Context Protocol) HTTP transport for foodnear.me.
 *
 * Protocol: JSON-RPC 2.0 over HTTP. Spec: https://modelcontextprotocol.io
 *
 * This file is the *transport shell only*. All dispatch lives in
 * `lib/mcp/rpc.ts`; tool implementations in `lib/mcp/tools/*`; metadata in
 * `lib/mcp/server-info.ts`, `lib/mcp/resources.ts`, and `lib/mcp/discovery.ts`.
 * Keep this file thin — if you find yourself adding business logic here,
 * push it down a layer.
 */

import { NextResponse } from "next/server";

import { CORS_HEADERS, RPC_ERRORS } from "@/lib/mcp/constants";
import { buildMcpDiscoveryPayload } from "@/lib/mcp/discovery";
import { isRpcError, makeRpcError, type RpcError } from "@/lib/mcp/errors";
import { handleRpcRequest } from "@/lib/mcp/rpc";
import { log, runWithRequest } from "@/lib/log";

/**
 * Generate a request id for the inbound POST. We prefer an
 * agent-supplied X-Request-ID when present so logs can be correlated
 * across hops (e.g. an upstream gateway); otherwise we mint a fresh
 * UUID. The id round-trips back via the X-Request-ID response header
 * and lands on the corresponding mcp_invocations row for traceability.
 */
function resolveRequestId(request: Request): string {
  const inbound = request.headers.get("x-request-id");
  if (inbound && /^[A-Za-z0-9_.\-]{1,128}$/.test(inbound)) return inbound;
  return crypto.randomUUID();
}

function headersWithRequestId(extra: Record<string, string>, requestId: string) {
  return { ...CORS_HEADERS, ...extra, "X-Request-ID": requestId };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type JsonRpcRequest = {
  jsonrpc?: string;
  method?: unknown;
  params?: unknown;
  id?: string | number | null;
};

function isRequestLike(value: unknown): value is JsonRpcRequest {
  return Boolean(value && typeof value === "object" && "method" in value);
}

function toEnvelope(err: unknown): RpcError {
  return isRpcError(err) ? err : makeRpcError(RPC_ERRORS.INTERNAL_ERROR, String(err));
}

export async function POST(request: Request) {
  const requestId = resolveRequestId(request);
  return runWithRequest({ requestId }, () => handlePost(request, requestId));
}

async function handlePost(request: Request, requestId: string): Promise<Response> {
  const startTime = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: RPC_ERRORS.PARSE_ERROR },
      { status: 400, headers: headersWithRequestId({}, requestId) },
    );
  }

  // Batch requests: dispatch each independently, drop nulls (notifications).
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map(async (req): Promise<unknown> => {
        if (!isRequestLike(req)) {
          return {
            jsonrpc: "2.0",
            id: (req as { id?: string | number | null } | null)?.id ?? null,
            error: RPC_ERRORS.INVALID_REQUEST,
          };
        }
        try {
          const result = await handleRpcRequest(req.method as string, req.params);
          if (result === null) return null;
          return { jsonrpc: "2.0", id: req.id ?? null, result };
        } catch (err) {
          log.error("mcp.batch_request_failed", {
            method: typeof req.method === "string" ? req.method : null,
            error: err instanceof Error ? err.message : String(err),
          });
          return { jsonrpc: "2.0", id: req.id ?? null, error: toEnvelope(err) };
        }
      }),
    );

    return NextResponse.json(responses.filter((r) => r !== null), {
      headers: headersWithRequestId(
        { "X-Response-Time": `${Date.now() - startTime}ms` },
        requestId,
      ),
    });
  }

  if (!isRequestLike(body)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: RPC_ERRORS.INVALID_REQUEST },
      { status: 400, headers: headersWithRequestId({}, requestId) },
    );
  }

  const typed = body as { method: string; params?: unknown; id?: string | number | null };
  try {
    const result = await handleRpcRequest(typed.method, typed.params);
    if (result === null && typed.id === undefined) {
      return new NextResponse(null, {
        status: 204,
        headers: headersWithRequestId({}, requestId),
      });
    }
    return NextResponse.json(
      { jsonrpc: "2.0", id: typed.id ?? null, result },
      {
        headers: headersWithRequestId(
          { "X-Response-Time": `${Date.now() - startTime}ms` },
          requestId,
        ),
      },
    );
  } catch (err) {
    const error = toEnvelope(err);
    log.error("mcp.request_failed", {
      method: typed.method,
      error_code: error.code,
      error_message: error.message,
    });
    return NextResponse.json(
      { jsonrpc: "2.0", id: typed.id ?? null, error },
      {
        status: error.code === RPC_ERRORS.METHOD_NOT_FOUND.code ? 404 : 500,
        headers: headersWithRequestId({}, requestId),
      },
    );
  }
}

export async function GET() {
  return NextResponse.json(buildMcpDiscoveryPayload(), {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60" },
  });
}
