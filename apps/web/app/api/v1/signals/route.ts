import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isDatabaseConfigured, sqlQuery } from "@/lib/db/neon";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/x402";
import {
  recordCuratorSignal,
  type CuratorSignalType,
  type RecordCuratorSignalResult,
} from "@/lib/curator-signals";
import { log } from "@/lib/log";

/**
 * Curator freshness signal — write-only. A POST records a content-free signal
 * that moves a human curator's ATTENTION. The response echoes NO tier, count,
 * timestamp, or checkmark: a signal is never a verification and never a public
 * aggregate. The table is server-only; nothing reads it back through any route.
 */

const SIGNAL_TYPES: readonly CuratorSignalType[] = ["outdated", "confirm"];

function isSignalType(value: unknown): value is CuratorSignalType {
  return typeof value === "string" && SIGNAL_TYPES.includes(value as CuratorSignalType);
}

/** Coarse, non-reversible actor key: hash(ip + ua + salt). Never stores raw PII;
 * used only for per-day de-dupe, not identity. */
function deriveActorHash(request: Request): string {
  const ip = getClientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const salt = process.env.SIGNAL_SALT ?? "";
  return createHash("sha256").update(`${ip}\n${ua}\n${salt}`).digest("hex");
}

type SignalPayload = {
  restaurant_id?: string;
  signal_type?: string;
};

/** Seams for unit testing without live Neon (tsx runs tests as CJS, where
 * node:test's mock.module is unavailable — so the codebase injects deps). */
export type SignalHandlerDeps = {
  restaurantExists: (id: string) => Promise<boolean>;
  record: (input: {
    restaurantId: string;
    signalType: CuratorSignalType;
    actorHash: string;
  }) => Promise<RecordCuratorSignalResult>;
};

async function defaultRestaurantExists(id: string): Promise<boolean> {
  const rows = await sqlQuery<{ id: string }>(
    `SELECT id FROM restaurants WHERE id = $1::uuid LIMIT 1`,
    [id],
  );
  return rows.length > 0;
}

export async function handleSignal(
  request: Request,
  deps: SignalHandlerDeps = { restaurantExists: defaultRestaurantExists, record: recordCuratorSignal },
): Promise<NextResponse> {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Signals unavailable — database not configured" },
      { status: 503 },
    );
  }

  // Defense-in-depth only — never load-bearing for tier integrity. Fails open on
  // Upstash outage (see lib/rate-limit).
  const ip = getClientIp(request);
  const rate = await checkRateLimit({ key: `signals:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests — slow down a moment." }, { status: 429 });
  }

  let body: SignalPayload;
  try {
    body = (await request.json()) as SignalPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const restaurantId = body.restaurant_id?.trim() ?? "";
  const signalType = body.signal_type;

  if (!restaurantId) {
    return NextResponse.json({ error: "restaurant_id is required" }, { status: 400 });
  }
  if (!isSignalType(signalType)) {
    return NextResponse.json(
      { error: "signal_type must be one of: outdated, confirm" },
      { status: 400 },
    );
  }

  try {
    const exists = await deps.restaurantExists(restaurantId);
    if (!exists) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }
  } catch (error) {
    // A malformed UUID lands here (invalid input syntax); treat as a bad request
    // rather than leaking a 500.
    const message = error instanceof Error ? error.message : String(error);
    if (/invalid input syntax/i.test(message)) {
      return NextResponse.json({ error: "Invalid restaurant_id" }, { status: 400 });
    }
    log.error("signals.lookup_failed", { error: message });
    return NextResponse.json({ error: "Signal write failed" }, { status: 500 });
  }

  const actorHash = deriveActorHash(request);
  const result = await deps.record({ restaurantId, signalType, actorHash });

  if (!result.ok) {
    return NextResponse.json({ error: "Signal write failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export function POST(request: Request) {
  return handleSignal(request);
}
