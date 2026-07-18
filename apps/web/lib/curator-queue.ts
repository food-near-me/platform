/**
 * Curator queue data — the internal, staleness-sorted list of restaurants that
 * have an OPEN freshness signal.
 *
 * Honesty invariants this file exists to keep:
 *  - The queue is prompt-to-LOOK only. It surfaces WHICH restaurants a curator
 *    should re-examine and HOW STALE the last curator check is — never a signal
 *    count, never any aggregate. Nothing here reads a signal to move a tier.
 *  - Ordering is by a TIME column (staleness), never by signal volume. Volume
 *    sorting would turn user clicks into a ranking lever, i.e. crowdsourced
 *    de-tiering. So there is deliberately no tallying/aggregate anywhere here.
 *  - `EXISTS` (not a join with an aggregate) decides membership; a scalar
 *    subquery reads only the LATEST signal time as a staleness proxy — no tally.
 *
 * `curator_signals` is read here (this module is added to the grep-sentinel
 * allow-list). Mute + campaign annotations live in a sibling table and alter NO
 * public surface.
 */

import type { getSql } from "@/lib/db/neon";

export type CuratorQueueRow = {
  restaurant_id: string;
  name: string | null;
  slug: string | null;
  /** Staleness proxy: last curator check (allergy_updated_at) if present, else
   * the earliest we can prove the listing was touched (latest signal time). */
  last_checked_at: string | null;
  campaign_flag: boolean;
};

/**
 * ORDER BY is a TIME column, ascending (stalest first). NULL last_checked_at —
 * never curator-checked — sorts FIRST (NULLS FIRST) because "never looked" is
 * the stalest possible state. There is intentionally no aggregate in this SQL.
 */
export const CURATOR_QUEUE_ORDER_BY =
  "ORDER BY last_checked_at ASC NULLS FIRST";

/** The membership + staleness query, kept as a constant so the sentinel can
 * assert the ORDER BY is time-based and no tally/aggregate sneaks in. */
export const CURATOR_QUEUE_QUERY = `
  SELECT
    r.id::text                          AS restaurant_id,
    r.name                              AS name,
    r.slug                              AS slug,
    COALESCE(
      r.allergy_updated_at,
      (SELECT max(cs.created_at)
         FROM curator_signals cs
        WHERE cs.restaurant_id = r.id)
    )                                   AS last_checked_at,
    COALESCE(cq.campaign_flag, false)   AS campaign_flag
  FROM restaurants r
  LEFT JOIN curator_queue_state cq ON cq.restaurant_id = r.id
  WHERE EXISTS (
    SELECT 1 FROM curator_signals cs
     WHERE cs.restaurant_id = r.id
  )
  AND NOT COALESCE(cq.muted, false)
  ${CURATOR_QUEUE_ORDER_BY}
  LIMIT 200
`;

type Sql = ReturnType<typeof getSql>;

/** Loads the queue. Injectable `sql` seam so unit tests never touch Neon. */
export async function loadCuratorQueue(sql: Sql): Promise<CuratorQueueRow[]> {
  const rows = (await sql.query(CURATOR_QUEUE_QUERY)) as CuratorQueueRow[];
  return rows;
}

/** Whole days elapsed since the last curator check; null if never checked. */
export function daysSince(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/** The bare-row copy: no count, no aggregate — a prompt to LOOK. */
export function stalenessLabel(iso: string | null, now: Date = new Date()): string {
  const days = daysSince(iso, now);
  if (days === null) return "never curator-checked · go look";
  if (days === 0) return "checked today · go look";
  if (days === 1) return "1 day since last curator check · go look";
  return `${days} days since last curator check · go look`;
}
