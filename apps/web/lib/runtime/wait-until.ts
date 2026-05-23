/**
 * Thin wrapper around `@vercel/functions` `waitUntil` that degrades
 * gracefully outside the Vercel runtime.
 *
 * Why: `waitUntil` is the only reliable way to keep a Vercel serverless
 * function alive long enough for fire-and-forget background work (e.g.
 * the MCP invocation insert) to land. Under `next start` locally, or in
 * unit tests, importing/using it directly either throws or no-ops
 * loudly. This helper swallows that so the same call site works
 * everywhere — in production it actually defers shutdown; locally it
 * just fires the promise.
 *
 * IMPORTANT: any work passed here MUST be self-contained; once the
 * outer handler returns, the request scope is gone.
 */

import { waitUntil } from "@vercel/functions";

export function safeWaitUntil(work: Promise<unknown>): void {
  try {
    waitUntil(work);
  } catch {
    // Outside Vercel infra (local dev, tests). Fire-and-forget; the
    // caller has already opted into not awaiting completion.
    void work;
  }
}
