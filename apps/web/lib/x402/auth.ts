/**
 * Phase A: presence-only auth check (Bearer or SIWX header non-empty).
 * Phase B will verify API keys against Stripe and SIWX signatures against wallets.
 */
export function hasPaidAuth(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ") && authorization.length > "Bearer ".length) {
    return true;
  }

  const siwx = request.headers.get("x-sign-in-with-x");
  if (siwx && siwx.trim().length > 0) {
    return true;
  }

  return false;
}
