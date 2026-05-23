/**
 * Custom error types for MCP tools and the JSON-RPC dispatch layer.
 *
 * Tool functions throw `ValidationError` / `ResourceNotFoundError` and the
 * RPC layer translates them into structured tool-error results via
 * `lib/mcp/tool-errors.ts`. The `RpcError` shape + `makeRpcError` are used
 * for protocol-level errors (parse error, method not found, etc.) that
 * surface in the JSON-RPC `error` field rather than inside `result`.
 */

import { RPC_ERRORS } from "./constants";

export class ValidationError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "ValidationError";
    this.hint = hint;
  }
}

export class ResourceNotFoundError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "ResourceNotFoundError";
    this.hint = hint;
  }
}

export type RpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export function makeRpcError(
  base: (typeof RPC_ERRORS)[keyof typeof RPC_ERRORS],
  details?: string,
): RpcError {
  return {
    code: base.code,
    message: details ? `${base.message}: ${details}` : base.message,
  };
}

/**
 * Type guard for protocol-level errors. We throw plain RpcError objects
 * (not Error instances) inside `handleRpcRequest`, so the POST handler
 * needs a structural check rather than `instanceof`.
 */
export function isRpcError(value: unknown): value is RpcError {
  return (
    typeof value === "object"
    && value !== null
    && typeof (value as { code?: unknown }).code === "number"
    && typeof (value as { message?: unknown }).message === "string"
  );
}
