/**
 * Structured logger + request-scoped context.
 *
 * Why: prior to this module log lines were a mix of `console.log` and
 * `console.error` with free-form formatting, which was useless for
 * production triage. We now emit one JSON object per line shaped like
 *
 *   { "level": "...", "event": "...", "ts": "...", "request_id": "...", ...meta }
 *
 * so Vercel log search can pivot by `request_id`, `tool_name`,
 * `restaurant_id`, `error_code` etc.
 *
 * Request context is propagated via AsyncLocalStorage so we never have
 * to thread `requestId` through every call site. Routes that enter the
 * application surface call `runWithRequest({ requestId }, fn)` once at
 * the top of the request, and every downstream `log.*` call (and the
 * instrumentation writer) inherits it automatically.
 *
 * Edge runtime caveat: AsyncLocalStorage is supported in the Vercel
 * Node.js serverless runtime (which our API routes use). If a route is
 * migrated to Edge, swap to header-threaded request ids or move the
 * runtime back to Node.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = {
  [key: string]: unknown;
};

export type RequestContext = {
  requestId: string;
};

const requestStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run `fn` with the given request context attached. Anything called
 * inside `fn` (including async callees) can read it via
 * `getCurrentRequestContext()` or get auto-augmented log lines.
 */
export function runWithRequest<T>(ctx: RequestContext, fn: () => T): T {
  return requestStorage.run(ctx, fn);
}

export function getCurrentRequestContext(): RequestContext | undefined {
  return requestStorage.getStore();
}

export function getCurrentRequestId(): string | undefined {
  return requestStorage.getStore()?.requestId;
}

function emit(level: LogLevel, event: string, ctx: LogContext = {}) {
  const requestId = getCurrentRequestId();
  const line = {
    level,
    event,
    ts: new Date().toISOString(),
    ...(requestId ? { request_id: requestId } : {}),
    ...ctx,
  };
  const json = JSON.stringify(line);
  if (level === "error") {
    console.error(json);
  } else if (level === "warn") {
    console.warn(json);
  } else {
    console.log(json);
  }
}

export const log = {
  debug: (event: string, ctx?: LogContext) => emit("debug", event, ctx),
  info: (event: string, ctx?: LogContext) => emit("info", event, ctx),
  warn: (event: string, ctx?: LogContext) => emit("warn", event, ctx),
  error: (event: string, ctx?: LogContext) => emit("error", event, ctx),
};
