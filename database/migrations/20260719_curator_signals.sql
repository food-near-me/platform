-- Content-free curator freshness signals (Neon; no PII, no freetext).
-- A signal moves a human curator's ATTENTION only. Nothing automated reads this
-- table to move a tier, note, rank, count, or attestation. There is no public
-- endpoint that reads it and no aggregate/count/view over it — by design.
CREATE TABLE IF NOT EXISTS curator_signals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  signal_type   TEXT NOT NULL CHECK (signal_type IN ('outdated', 'confirm')),
  actor_hash    TEXT,               -- server-derived coarse key hash(ip+ua+salt); NEVER raw PII
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO freetext column: the queue can prompt-to-look, never persuade.
);

-- de-dupe: one signal per (restaurant, type, actor) per UTC day. The day is
-- pinned to UTC ((… AT TIME ZONE 'UTC')::date) so the index expression is
-- IMMUTABLE — a plain created_at::date depends on the session timezone and
-- Postgres rejects it in an index.
CREATE UNIQUE INDEX IF NOT EXISTS curator_signals_dedupe
  ON curator_signals (restaurant_id, signal_type, actor_hash, ((created_at AT TIME ZONE 'UTC')::date));

CREATE INDEX IF NOT EXISTS curator_signals_restaurant_idx
  ON curator_signals (restaurant_id, created_at DESC);
