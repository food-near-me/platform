/**
 * Ops session auth via an httpOnly cookie — NOT a URL `?key=` gate.
 *
 * Why: the old ops gate compared `?key=` to OPS_SECRET, which leaks the secret
 * through Referer headers, browser history, and access logs. Here the secret is
 * POSTed once to /ops/login and exchanged for an httpOnly, SameSite=Lax session
 * cookie that never rides in a URL. The cookie value is the constant-time-
 * comparable secret itself (server-only surface, no public read of it), so a
 * missing/wrong cookie simply fails closed.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const OPS_COOKIE = "ops_session";

function opsSecret(): string | null {
  return process.env.OPS_SECRET?.trim() || null;
}

/** Deterministic session token derived from the secret, so a valid cookie
 * proves knowledge of OPS_SECRET without ever putting the raw secret in a URL. */
export function opsSessionToken(): string | null {
  const secret = opsSecret();
  if (!secret) return null;
  return createHash("sha256").update(`ops_session\n${secret}`).digest("hex");
}

/** Constant-time equality; false on any length/format mismatch. */
function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True iff the given cookie value is a valid ops session. Pure function so it
 * is unit-testable without `next/headers`. */
export function isValidOpsToken(cookieValue: string | undefined): boolean {
  const expected = opsSessionToken();
  if (!expected) return false;
  if (!cookieValue) return false;
  return tokensMatch(cookieValue, expected);
}

/** Reads the request cookie and returns whether the caller holds a valid ops
 * session. Server components / route handlers only (uses `next/headers`). */
export async function isOpsAuthed(): Promise<boolean> {
  const store = await cookies();
  return isValidOpsToken(store.get(OPS_COOKIE)?.value);
}
