-- Provenance timestamp for a curated allergy tier: the newest curator source
-- check (max sources[].checked_at) backing the CURRENT allergy_safety_tier.
--
-- Set only by the curated seed loader, which refuses to ship a curated tier that
-- has no fresh source (C4 gate). NULL when the tier is 'unknown' (nothing to
-- have verified). Never auto-advanced by a curator signal — a signal moves a
-- human's attention, never a date.
--
-- This is the honest "as of" for a safety claim: it reflects when the TIER was
-- verified, not when contact fields last changed (last_external_update) — the
-- distinction C6 binds into the fnm-safety attestation.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS tier_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN restaurants.tier_verified_at IS
  'Newest curator source check (max sources[].checked_at) backing the current allergy_safety_tier. Set only by the curated seed loader; NULL when tier is unknown. Never auto-advanced by a signal.';
