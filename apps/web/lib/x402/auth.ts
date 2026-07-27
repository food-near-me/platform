/**
 * Internal API-key bypass for paid x402 resources.
 *
 * Presence-only Bearer/SIWX checks are retired. A bypass only succeeds when
 * FNM_X402_API_KEY is configured and the Authorization Bearer token matches
 * exactly (timing-safe). Unset key ⇒ no bypass path.
 */

import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function hasApiKeyBypass(
  request: Request,
  expectedKey: string,
): boolean {
  if (!expectedKey) return false;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return false;

  return safeEqual(token, expectedKey);
}

export function hasApiKeyBypassToken(
  authorizationHeader: string | null | undefined,
  expectedKey: string,
): boolean {
  if (!expectedKey || !authorizationHeader) return false;
  if (!authorizationHeader.startsWith("Bearer ")) return false;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return false;
  return safeEqual(token, expectedKey);
}

/** @deprecated Use hasApiKeyBypass — presence-only auth is retired. */
export function hasPaidAuth(_request: Request): boolean {
  return false;
}
