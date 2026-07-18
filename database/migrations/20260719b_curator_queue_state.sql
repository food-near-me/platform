-- Internal curator queue annotations (Neon; server-only, no public read surface).
-- Alters NO public surface: `muted` merely stops a restaurant from surfacing in
-- the internal ops queue; `campaign_flag` is a private "possible campaign" note.
-- Neither feeds a tier, a note, a ranking, or any public count/aggregate. There
-- is deliberately no aggregate/count/view over curator_signals anywhere.
CREATE TABLE IF NOT EXISTS curator_queue_state (
  restaurant_id UUID PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  muted         BOOLEAN NOT NULL DEFAULT false,   -- stop surfacing in the queue
  campaign_flag BOOLEAN NOT NULL DEFAULT false,   -- private "possible campaign" annotation
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
