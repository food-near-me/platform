import { NextResponse } from "next/server";
import { getDatabaseHost, getSql, isDatabaseConfigured } from "@/lib/db/neon";

/**
 * DB health — Neon connectivity + search RPC smoke.
 */
export async function GET() {
  const host = getDatabaseHost();
  const env = {
    databaseUrlConfigured: isDatabaseConfigured(),
    host,
  };

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        stage: "env",
        message: "DATABASE_URL missing in this runtime",
        env,
      },
      { status: 500 },
    );
  }

  const started = Date.now();
  try {
    const sql = getSql();
    const ping = await sql`select 1 as ok`;
    const search = await sql`
      SELECT COUNT(*)::int AS n FROM restaurants
    `;
    return NextResponse.json({
      ok: true,
      stage: "neon",
      message: "Neon reachable",
      env,
      probe: {
        ms: Date.now() - started,
        ping: ping[0],
        restaurantCount: search[0]?.n ?? 0,
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return NextResponse.json(
      {
        ok: false,
        stage: "fetch",
        message: "Failed to reach Neon from this runtime",
        env,
        probe: {
          ms: Date.now() - started,
          errorName: err.name,
          errorMessage: err.message,
        },
      },
      { status: 500 },
    );
  }
}
