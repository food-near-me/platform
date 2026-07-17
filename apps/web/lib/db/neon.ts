import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sqlInstance: NeonQueryFunction<false, false> | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL (Neon connection string)");
  }
  if (!sqlInstance) {
    sqlInstance = neon(url);
  }
  return sqlInstance;
}

/** Default hard ceiling for a single query, so a slow/hung DB fails fast
 * instead of blocking the request until the platform timeout. */
export const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

/**
 * Parameterized query with a per-call timeout that aborts the underlying fetch
 * (the Neon HTTP driver forwards `fetchOptions.signal`). Prefer this over
 * `getSql().query(...)` on request paths where an unbounded wait is unacceptable.
 */
export async function sqlQuery<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS,
): Promise<T[]> {
  const sql = getSql();
  return (await sql.query(text, params, {
    fetchOptions: { signal: AbortSignal.timeout(timeoutMs) },
  })) as T[];
}

export function getDatabaseHost(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
