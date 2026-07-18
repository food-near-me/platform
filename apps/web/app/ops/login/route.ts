import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { OPS_COOKIE, opsSessionToken } from "@/lib/ops-auth";

/**
 * Ops login — exchanges the shared OPS_SECRET for an httpOnly session cookie,
 * so the secret never rides in a URL (`?key=`) where it leaks via Referer/logs.
 * POST { secret } → sets the cookie on success. No public read surface.
 */

function secretsMatch(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

export async function POST(request: Request): Promise<NextResponse> {
  const expected = process.env.OPS_SECRET?.trim();
  const token = opsSessionToken();
  if (!expected || !token) {
    return NextResponse.json({ error: "Ops auth not configured" }, { status: 503 });
  }

  let submitted = "";
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { secret?: string };
      submitted = body.secret?.trim() ?? "";
    } else {
      const form = await request.formData();
      submitted = String(form.get("secret") ?? "").trim();
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!submitted || !secretsMatch(submitted, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(OPS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/ops",
    maxAge: 60 * 60 * 8, // 8h session
  });
  return res;
}
