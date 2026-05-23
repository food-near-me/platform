-- Phase 3b: race-safe menu verification approval.
--
-- Replaces the multi-statement, no-lock flow in approveMenuVerification()
-- with a single transactional RPC that:
--   1. Locks the restaurants row FOR UPDATE (serializes concurrent approvers).
--   2. Checks current verification_status; if already 'verified', returns
--      the existing published menu id with already_verified = true so the
--      caller can no-op idempotently (double-click / network retry).
--   3. Finds the current pending_approval menu (preferred) or published
--      menu and validates that it matches the caller's expected_menu_id.
--      If a concurrent verification changed the state since the caller
--      read it, returns menu_state_changed = true so the caller can
--      re-read and retry.
--   4. Atomically: deletes any stale published menu, promotes the pending
--      menu to published, attaches the signature columns, and flips
--      restaurants.verification_status = 'verified'.
--   5. Returns the final menu id with already_verified = false.
--
-- The Ed25519 signature is computed by the Node process *before* calling
-- this RPC because the private key never leaves the Node runtime. The
-- expected_menu_id arg + matching check in step 3 closes the TOCTOU
-- between Node's read and the RPC's lock.
--
-- Apply via: npm run db:migrate:race-safe-approve

DROP FUNCTION IF EXISTS approve_menu_verification_atomic(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION approve_menu_verification_atomic(
  p_restaurant_id        UUID,
  p_expected_menu_id     UUID,
  p_signature_hash       TEXT,
  p_signature_signer     TEXT,
  p_signature_timestamp  TIMESTAMPTZ
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
  v_current_status   TEXT;
  v_pending_menu_id  UUID;
  v_published_menu_id UUID;
  v_final_menu_id    UUID;
BEGIN
  -- Step 1: lock the restaurant row. All concurrent approvers serialize here.
  SELECT verification_status INTO v_current_status
  FROM restaurants
  WHERE id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restaurant_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Step 2: idempotent already-verified short-circuit.
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

  -- Step 3: discover the current pending + published menus.
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

  -- Step 3b: TOCTOU guard. The caller signed against expected_menu_id;
  -- if reality moved, bounce them back to re-read.
  IF v_final_menu_id <> p_expected_menu_id THEN
    RETURN QUERY
      SELECT NULL::UUID AS menu_id,
             FALSE      AS already_verified,
             TRUE       AS menu_state_changed;
    RETURN;
  END IF;

  -- Step 4a: promote pending -> published (if a pending menu exists).
  IF v_pending_menu_id IS NOT NULL THEN
    IF v_published_menu_id IS NOT NULL AND v_published_menu_id <> v_pending_menu_id THEN
      DELETE FROM menus WHERE id = v_published_menu_id;
    END IF;

    UPDATE menus
       SET status = 'published',
           updated_at = NOW()
     WHERE id = v_pending_menu_id;
  END IF;

  -- Step 4b: attach signature.
  UPDATE menus
     SET signature_hash      = p_signature_hash,
         signature_signer    = p_signature_signer,
         signature_timestamp = p_signature_timestamp,
         updated_at          = COALESCE(p_signature_timestamp, NOW())
   WHERE id = v_final_menu_id;

  -- Step 4c: flip restaurant to verified.
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

COMMENT ON FUNCTION approve_menu_verification_atomic(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) IS
  'Race-safe owner approval. Locks restaurants row FOR UPDATE, validates expected_menu_id, '
  'atomically promotes pending->published, attaches signature, flips restaurant to verified. '
  'Returns menu_state_changed=true when a concurrent approver mutated state between the '
  'caller''s read and the lock; caller should re-read and retry.';

GRANT EXECUTE ON FUNCTION approve_menu_verification_atomic(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;
REVOKE EXECUTE ON FUNCTION approve_menu_verification_atomic(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ)
  FROM anon, authenticated, PUBLIC;
