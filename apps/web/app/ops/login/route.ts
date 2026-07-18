import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { OPS_COOKIE, opsSessionToken, safeOpsNext } from "@/lib/ops-auth";

/**
 * Ops login — exchanges the shared OPS_SECRET for an httpOnly session cookie,
 * so the secret never rides in a URL (`?key=`) where it leaks via Referer/logs.
 *
 * Two callers:
 *  - a browser <form> POST → 303-redirects back to a sanitized `next` under
 *    /ops (or `${next}?autherror=1` on a bad secret).
 *  - a programmatic JSON POST → returns { ok: true } / 401. No public read.
 */

function secretsMatch(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(OPS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/ops",
    maxAge: 60 * 60 * 8, // 8h session
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const expected = process.env.OPS_SECRET?.trim();
  const token = opsSessionToken();
  if (!expected || !token) {
    return NextResponse.json({ error: "Ops auth not configured" }, { status: 503 });
  }

  const isJson = (request.headers.get("content-type") ?? "").includes("application/json");
  let submitted = "";
  let next = "";
  try {
    if (isJson) {
      const body = (await request.json()) as { secret?: string };
      submitted = body.secret?.trim() ?? "";
    } else {
      const form = await request.formData();
      submitted = String(form.get("secret") ?? "").trim();
      next = String(form.get("next") ?? "");
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const target = safeOpsNext(next); // same-origin /ops path only — no open redirect
  const ok = Boolean(submitted) && secretsMatch(submitted, expected);

  if (!ok) {
    return isJson
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : NextResponse.redirect(new URL(`${target}?autherror=1`, request.url), 303);
  }

  const res = isJson
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL(target, request.url), 303);
  setSessionCookie(res, token);
  return res;
}
