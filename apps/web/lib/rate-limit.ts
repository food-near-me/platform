/**
 * Distributed-capable rate limiter.
 *
 * Selection:
 *   - When `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, all
 *     counters live in Upstash Redis (works across serverless instances /
 *     Vercel regions, survives restarts).
 *   - Otherwise falls back to a per-process in-memory store. Suitable for
 *     local development and tests; NOT suitable for production multi-instance
 *     deploys, where each instance would enforce its own limit.
 *
 * The public API (`checkRateLimit`, `checkMinInterval`) is async regardless of
 * adapter so callers always `await`. The in-memory adapter resolves
 * synchronously; the Upstash adapter performs a single HTTP round-trip per
 * call (pipelined when more than one command is needed).
 *
 * On Upstash failure we fail-open (allow the request) and log once. Failing
 * closed would let a Redis outage take the entire site down; a brief
 * counter-reset window is the lesser evil and matches what the project's
 * other resilience layers do (Supabase fallbacks, instrumentation).
 */

import { checkInMemoryMinInterval, checkInMemoryRateLimit } from "./rate-limit/in-memory";
import { checkUpstashMinInterval, checkUpstashRateLimit, hasUpstashConfig } from "./rate-limit/upstash";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
};

export type MinIntervalResult = {
  allowed: boolean;
};

export type CheckRateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export type CheckMinIntervalOptions = {
  key: string;
  minIntervalMs: number;
};

let warnedAboutFallback = false;

export function rateLimitBackend(): "upstash" | "in-memory" {
  return hasUpstashConfig() ? "upstash" : "in-memory";
}

function warnFallbackOnce(error: unknown): void {
  if (warnedAboutFallback) return;
  warnedAboutFallback = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[rate-limit] Upstash unavailable, falling back to in-memory for this process. Reason: ${message}`,
  );
}

export async function checkRateLimit(
  options: CheckRateLimitOptions,
): Promise<RateLimitResult> {
  if (!hasUpstashConfig()) {
    return checkInMemoryRateLimit(options);
  }

  try {
    return await checkUpstashRateLimit(options);
  } catch (error) {
    warnFallbackOnce(error);
    return checkInMemoryRateLimit(options);
  }
}

export async function checkMinInterval(
  options: CheckMinIntervalOptions,
): Promise<MinIntervalResult> {
  if (!hasUpstashConfig()) {
    return checkInMemoryMinInterval(options);
  }

  try {
    return await checkUpstashMinInterval(options);
  } catch (error) {
    warnFallbackOnce(error);
    return checkInMemoryMinInterval(options);
  }
}
