/**
 * Upstash Redis REST adapter for the distributed rate limiter.
 *
 * Uses the REST API directly (no `@upstash/redis` dependency) — the surface we
 * need is tiny and a single fetch call per check keeps the dependency graph
 * lean and Edge-runtime-safe.
 *
 * Required env vars (set in Vercel and `.env.local` for prod-like testing):
 *   UPSTASH_REDIS_REST_URL    https://<region>-<name>.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN  read-write token
 *
 * Optional:
 *   UPSTASH_RATE_LIMIT_PREFIX (default "fnm:rl")  namespace for keys
 *   UPSTASH_RATE_LIMIT_TIMEOUT_MS (default 1500) per-call HTTP timeout
 *
 * Keys are namespaced so prod / staging / dev never share counters.
 */

import type {
  CheckMinIntervalOptions,
  CheckRateLimitOptions,
  MinIntervalResult,
  RateLimitResult,
} from "../rate-limit";

type PipelineResponse = Array<{ result: unknown } | { error: string }>;

const DEFAULT_PREFIX = "fnm:rl";
const DEFAULT_TIMEOUT_MS = 1500;

function envOrEmpty(key: string): string {
  return (process.env[key] ?? "").trim();
}

export function hasUpstashConfig(): boolean {
  return envOrEmpty("UPSTASH_REDIS_REST_URL").length > 0
    && envOrEmpty("UPSTASH_REDIS_REST_TOKEN").length > 0;
}

function prefix(): string {
  return envOrEmpty("UPSTASH_RATE_LIMIT_PREFIX") || DEFAULT_PREFIX;
}

function timeoutMs(): number {
  const raw = Number(envOrEmpty("UPSTASH_RATE_LIMIT_TIMEOUT_MS"));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_TIMEOUT_MS;
}

function namespacedKey(key: string): string {
  return `${prefix()}:${key}`;
}

async function pipeline(commands: Array<Array<string | number>>): Promise<PipelineResponse> {
  const url = envOrEmpty("UPSTASH_REDIS_REST_URL");
  const token = envOrEmpty("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) throw new Error("Upstash env vars missing at call time");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(commands),
      signal: controller.signal,
      // Edge-runtime friendly; do not cache rate-limit calls.
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Upstash HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    return (await res.json()) as PipelineResponse;
  } finally {
    clearTimeout(timeout);
  }
}

function expectNumber(entry: { result: unknown } | { error: string } | undefined, label: string): number {
  if (!entry) throw new Error(`Upstash pipeline missing ${label} entry`);
  if ("error" in entry) throw new Error(`Upstash ${label} error: ${entry.error}`);
  const value = entry.result;
  if (typeof value !== "number") {
    throw new Error(`Upstash ${label} expected number, got ${typeof value}`);
  }
  return value;
}

export async function checkUpstashRateLimit(
  options: CheckRateLimitOptions,
): Promise<RateLimitResult> {
  const { key, limit, windowMs } = options;
  const k = namespacedKey(key);

  // INCR first, then conditionally set TTL only when this was the bucket's
  // first hit. We always send EXPIRE NX-style by checking PTTL; doing INCR +
  // EXPIRE unconditionally would reset the window on every hit.
  const [incr, pttl] = await pipeline([
    ["INCR", k],
    ["PTTL", k],
  ]);

  const count = expectNumber(incr, "INCR");
  const ttl = expectNumber(pttl, "PTTL");

  if (ttl < 0) {
    // -1 = no TTL set yet (first hit or expired between INCR and PTTL),
    // -2 = key missing. Set the window.
    await pipeline([["PEXPIRE", k, windowMs]]);
  }

  const allowed = count <= limit;
  return {
    allowed,
    remaining: allowed ? Math.max(0, limit - count) : 0,
  };
}

export async function checkUpstashMinInterval(
  options: CheckMinIntervalOptions,
): Promise<MinIntervalResult> {
  const { key, minIntervalMs } = options;
  const k = `${namespacedKey(key)}:debounce`;

  // SET key 1 NX PX <minIntervalMs> — succeeds (OK) only when key absent.
  // Returns null when key exists, OK when newly written.
  const [result] = await pipeline([
    ["SET", k, "1", "NX", "PX", minIntervalMs],
  ]);

  if (!result) throw new Error("Upstash SET returned no entry");
  if ("error" in result) throw new Error(`Upstash SET error: ${result.error}`);

  return { allowed: result.result === "OK" };
}
