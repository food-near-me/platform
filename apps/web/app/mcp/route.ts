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
  const startTime = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: RPC_ERRORS.PARSE_ERROR },
      { status: 400, headers: CORS_HEADERS },
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
          return { jsonrpc: "2.0", id: req.id ?? null, error: toEnvelope(err) };
        }
      }),
    );

    return NextResponse.json(responses.filter((r) => r !== null), {
      headers: { ...CORS_HEADERS, "X-Response-Time": `${Date.now() - startTime}ms` },
    });
  }

  if (!isRequestLike(body)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: RPC_ERRORS.INVALID_REQUEST },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const typed = body as { method: string; params?: unknown; id?: string | number | null };
  try {
    const result = await handleRpcRequest(typed.method, typed.params);
    if (result === null && typed.id === undefined) {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }
    return NextResponse.json(
      { jsonrpc: "2.0", id: typed.id ?? null, result },
      { headers: { ...CORS_HEADERS, "X-Response-Time": `${Date.now() - startTime}ms` } },
    );
  } catch (err) {
    const error = toEnvelope(err);
    return NextResponse.json(
      { jsonrpc: "2.0", id: typed.id ?? null, error },
      {
        status: error.code === RPC_ERRORS.METHOD_NOT_FOUND.code ? 404 : 500,
        headers: CORS_HEADERS,
      },
    );
  }
}

export async function GET() {
  return NextResponse.json(buildMcpDiscoveryPayload(), {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60" },
  });
}
