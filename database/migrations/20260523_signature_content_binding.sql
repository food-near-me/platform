-- Phase 3c: content-bound menu signatures (fnm-v1).
--
-- The legacy signature scheme (fnm-v0) signed only the tuple
--   `${restaurantId}:${menuId}:${signer}:${timestamp}`
-- which proved that an owner approved *something* at a point in time but
-- did NOT bind the signature to actual menu contents. An edit to a price
-- or allergen after approval left the old signature still validating
-- against the same tuple, giving false assurance to verifying agents.
--
-- fnm-v1 binds the signature to a canonical content fingerprint. The
-- Node signer computes:
--   payload_hash   = sha256( stableStringify( canonical_content ) )
--   signing_input  = `fnm-v1:${restaurantId}:${menuId}:${signer}:${timestamp}:${payload_hash}`
--   signature      = ed25519_sign( sha256( signing_input ) )
-- and stores payload_hash + signing_format alongside the signature so
-- verifiers can re-derive the signing input from the public response.
--
-- This migration:
--   1. Adds menus.payload_hash and menus.signing_format columns.
--   2. Backfills signing_format='fnm-v0' on every existing verified menu
--      so consumers can distinguish content-bound from legacy signatures.
--   3. Re-declares approve_menu_verification_atomic with two new params
--      (p_payload_hash, p_signing_format) that default to NULL for any
--      callers that haven't been updated yet.
--
-- Apply via: npm run db:migrate:signature-content-binding

------------------------------------------------------------------------------
-- 1. Columns
------------------------------------------------------------------------------

ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS payload_hash   TEXT,
  ADD COLUMN IF NOT EXISTS signing_format TEXT;

COMMENT ON COLUMN menus.payload_hash IS
  'SHA-256 hex of the canonical menu content fingerprint (see @foodnearme/menu-protocol).'
  ' Required for fnm-v1 signatures; NULL for legacy fnm-v0 signatures.';
COMMENT ON COLUMN menus.signing_format IS
  'Signature scheme identifier. fnm-v0 = legacy tuple-only signature (no content binding). '
  'fnm-v1 = content-bound signature; payload_hash is set.';

------------------------------------------------------------------------------
-- 2. Backfill: stamp legacy signatures as fnm-v0 so consumers can
--    detect them and downgrade trust accordingly.
------------------------------------------------------------------------------

UPDATE menus
   SET signing_format = 'fnm-v0'
 WHERE signature_hash IS NOT NULL
   AND signing_format IS NULL;

------------------------------------------------------------------------------
-- 3. Replace the RPC with the v1-aware signature.
--    Old callers that don't pass payload_hash/signing_format still work
--    because the params default to NULL.
------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS approve_menu_verification_atomic(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS approve_menu_verification_atomic(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION approve_menu_verification_atomic(
  p_restaurant_id        UUID,
  p_expected_menu_id     UUID,
  p_signature_hash       TEXT,
  p_signature_signer     TEXT,
  p_signature_timestamp  TIMESTAMPTZ,
  p_payload_hash         TEXT  DEFAULT NULL,
  p_signing_format       TEXT  DEFAULT NULL
) RETURNS TABLE(
  menu_id              UUID,
  already_verified     BOOLEAN,
  menu_state_changed   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status    TEXT;
  v_pending_menu_id   UUID;
  v_published_menu_id UUID;
  v_final_menu_id     UUID;
BEGIN
  SELECT verification_status INTO v_current_status
  FROM restaurants
  WHERE id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restaurant_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_status = 'verified' THEN
    SELECT m.id INTO v_published_menu_id
    FROM menus m
    WHERE m.restaurant_id = p_restaurant_id
      AND m.status = 'published'
    LIMIT 1;

    RETURN QUERY
      SELECT COALESCE(v_published_menu_id, p_expected_menu_id) AS menu_id,
             TRUE  AS already_verified,
             FALSE AS menu_state_changed;
    RETURN;
  END IF;

  SELECT id INTO v_pending_menu_id
  FROM menus
  WHERE restaurant_id = p_restaurant_id
    AND status = 'pending_approval'
  LIMIT 1;

  SELECT id INTO v_published_menu_id
  FROM menus
  WHERE restaurant_id = p_restaurant_id
    AND status = 'published'
  LIMIT 1;

  v_final_menu_id := COALESCE(v_pending_menu_id, v_published_menu_id);

  IF v_final_menu_id IS NULL THEN
    RAISE EXCEPTION 'no_menu_available' USING ERRCODE = 'P0002';
  END IF;

  IF v_final_menu_id <> p_expected_menu_id THEN
    RETURN QUERY
      SELECT NULL::UUID AS menu_id,
             FALSE      AS already_verified,
             TRUE       AS menu_state_changed;
    RETURN;
  END IF;

  IF v_pending_menu_id IS NOT NULL THEN
    IF v_published_menu_id IS NOT NULL AND v_published_menu_id <> v_pending_menu_id THEN
      DELETE FROM menus WHERE id = v_published_menu_id;
    END IF;

    UPDATE menus
       SET status = 'published',
           updated_at = NOW()
     WHERE id = v_pending_menu_id;
  END IF;

  UPDATE menus
     SET signature_hash      = p_signature_hash,
         signature_signer    = p_signature_signer,
         signature_timestamp = p_signature_timestamp,
         payload_hash        = p_payload_hash,
         signing_format      = COALESCE(p_signing_format, 'fnm-v0'),
         updated_at          = COALESCE(p_signature_timestamp, NOW())
   WHERE id = v_final_menu_id;

  UPDATE restaurants
     SET verification_status = 'verified',
         source              = 'owner_verified',
         updated_at          = COALESCE(p_signature_timestamp, NOW())
   WHERE id = p_restaurant_id;

  RETURN QUERY
    SELECT v_final_menu_id AS menu_id,
           FALSE           AS already_verified,
           FALSE           AS menu_state_changed;
END;
$$;

COMMENT ON FUNCTION approve_menu_verification_atomic(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) IS
  'Race-safe owner approval. Locks restaurants row FOR UPDATE, validates '
  'expected_menu_id, atomically promotes pending->published, attaches '
  'signature + content-bound payload_hash + signing_format, flips restaurant '
  'to verified. Returns menu_state_changed=true when a concurrent approver '
  'mutated state between the caller''s read and the lock.';

GRANT EXECUTE ON FUNCTION approve_menu_verification_atomic(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)
  TO service_role;
REVOKE EXECUTE ON FUNCTION approve_menu_verification_atomic(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT)
  FROM anon, authenticated, PUBLIC;
