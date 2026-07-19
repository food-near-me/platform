import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  isAllowedRevalidatePath,
  parseBearer,
} from "@/lib/near-me/revalidate-guard";
import { log } from "@/lib/log";

/**
 * C7 — internal cache-purge endpoint.
 *
 * The curated seed loader runs offline (a tsx script with no Next runtime) and so
 * cannot call revalidatePath() itself. After a reseed it POSTs the affected paths
 * here; this route (which DOES run in the Next runtime) purges the full-route
 * cache for each, so a curated→unknown tier DROP disappears from the SSG hood
 * pages immediately instead of lingering up to an hour.
 *
 * Auth: `Authorization: Bearer <OPS_SECRET>`, constant-time compared. Fails closed
 * with no secret configured. Paths are allowlisted (place/hood only) so this can
 * never be turned into an arbitrary-route purge oracle.
 */

function bearerAuthorized(header: string | null): boolean {
  const secret = process.env.OPS_SECRET?.trim();
  if (!secret) return false; // no secret configured → fail closed
  const token = parseBearer(header);
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!bearerAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const paths = (body as { paths?: unknown } | null)?.paths;
  if (!Array.isArray(paths) || paths.length === 0) {
    return NextResponse.json({ error: "paths[] required" }, { status: 400 });
  }

  // Reject the whole request if ANY path is out of the allowlist — never silently
  // drop a bad path (that would mask a caller bug and leave a page stale).
  const rejected = paths.filter((p) => !isAllowedRevalidatePath(p));
  if (rejected.length > 0) {
    return NextResponse.json({ error: "disallowed paths", rejected }, { status: 400 });
  }

  const unique = Array.from(new Set(paths as string[]));
  for (const path of unique) {
    revalidatePath(path);
  }

  log.info("internal.revalidate", { count: unique.length });
  return NextResponse.json({ revalidated: unique.length });
}
