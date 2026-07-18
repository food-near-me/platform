/**
 * Curator freshness signals — server-only write path.
 *
 * A signal is an INPUT TO HUMAN JUDGMENT ONLY. Nothing here (or anywhere) reads
 * this table to move a tier, note, rank, count, or attestation; there is no
 * public aggregate. The write is content-free (no freetext) and de-duped to one
 * row per (restaurant, type, actor) per day via a UNIQUE index; a same-day
 * repeat is an idempotent no-op (`deduped: true`), never a second row.
 */

import { getSql } from "@/lib/db/neon";
import { log } from "@/lib/log";

export type CuratorSignalType = "outdated" | "confirm";

export type RecordCuratorSignalInput = {
  restaurantId: string;
  signalType: CuratorSignalType;
  actorHash: string;
};

export type RecordCuratorSignalResult = {
  ok: boolean;
  deduped: boolean;
};

/** Injectable query executor (Neon's `sql.query`). Defaults to the live Neon
 * client; tests pass a stub so no unit test touches the database. */
type SqlExecutor = (
  text: string,
  params?: unknown[],
) => Promise<Record<string, unknown>[]>;

/**
 * Insert a content-free curator signal, AWAITED, with ON CONFLICT DO NOTHING so
 * a same-actor same-day repeat is idempotent. A conflict returns zero rows
 * (`deduped: true`); a real insert returns one (`deduped: false`). Any
 * non-conflict error resolves to `{ ok: false }` and is logged as a monitored
 * error (never a swallowed warn), so a broken write surfaces in triage.
 */
export async function recordCuratorSignal(
  input: RecordCuratorSignalInput,
  sqlExecutor?: SqlExecutor,
): Promise<RecordCuratorSignalResult> {
  const exec: SqlExecutor =
    sqlExecutor ??
    ((text, params) =>
      getSql().query(text, params) as Promise<Record<string, unknown>[]>);

  try {
    const rows = await exec(
      `INSERT INTO curator_signals (restaurant_id, signal_type, actor_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [input.restaurantId, input.signalType, input.actorHash],
    );
    return { ok: true, deduped: rows.length === 0 };
  } catch (error) {
    log.error("curator_signal.write_failed", {
      error: error instanceof Error ? error.message : String(error),
      restaurant_id: input.restaurantId,
      signal_type: input.signalType,
    });
    return { ok: false, deduped: false };
  }
}
