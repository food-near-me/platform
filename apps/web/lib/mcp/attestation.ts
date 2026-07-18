/**
 * Agent-facing allergy-safety disclosure + signed attestation.
 *
 * This is the single honesty gate for every agent-facing safety claim. It
 * routes EVERY tier through the same curated whitelist that ranking and the OG
 * badge use (`CURATED_TIERS` in lib/near-me/rank), so an uncurated (`unknown`)
 * place can never carry a tier label, an allergy note, or a signature.
 *
 * Two layers:
 *   - buildSafetyDisclosure() — pure, keyless. Curated -> tier label (+ needs,
 *     note); uncurated -> an explicit "unknown, verify with the restaurant"
 *     advisory. This is the "we say unknown, not a guess" contract (Wave 2·B).
 *   - buildSafetyAttestation() — wraps the disclosure and, ONLY for a curated
 *     tier with a signing key available, attaches an Ed25519 attestation an
 *     agent can quote verbatim (Wave 2·A). It never signs a non-claim.
 *
 * The signed struct is a NEW canonical format, `fnm-safety-v1`, distinct from
 * the menu `fnm-v1` content-hash flow (which hashes menu items — the wrong
 * shape for a tier claim). It binds {scheme, restaurant_id, tier, as_of,
 * key_fingerprint} so a verifier can reconstruct and check it offline against
 * the public key at /.well-known/menu-signing-keys.json.
 */

import { createHash } from "node:crypto";

import {
  fingerprintPublicKey,
  loadSigningKeyFromEnv,
  signMenuHash,
} from "@foodnearme/menu-protocol";

import { CURATED_TIERS, safetyTierLabel } from "@/lib/near-me/rank";

export const SAFETY_ATTESTATION_SCHEME = "fnm-safety-v1";

const PUBLIC_KEY_URL = "https://foodnear.me/.well-known/menu-signing-keys.json";

/** The single sentence an uncurated place always returns instead of a guess. */
export const UNCURATED_ADVISORY = "No curated allergy info — verify with the restaurant.";

/** The whitelist gate — identical to what governs ranking and the OG badge. */
function isCuratedTier(tier: string | null | undefined): boolean {
  return Boolean(tier && (CURATED_TIERS as readonly string[]).includes(tier));
}

export type SafetyDisclosureInput = {
  restaurant_id: string;
  tier: string | null | undefined;
  as_of?: string | null;
  allergy_needs?: string[] | null;
  allergy_safety_note?: string | null;
};

export type SafetyDisclosure = {
  restaurant_id: string;
  /** Whitelist-derived. A CURATED_TIERS value, or "unknown" — never the raw DB value. */
  safety_tier: string;
  curated: boolean;
  /** Tier label for a curated tier; the "No curated allergy info" label otherwise. */
  safety_label: string;
  /** Present only for a curated tier. The listing's last DATA-refresh timestamp
   *  (e.g. an automated source import) — NOT a date a human re-verified the tier.
   *  Named `as_of` deliberately so an agent cannot read it as a curation date. */
  as_of?: string | null;
  allergy_needs?: string[];
  allergy_safety_note?: string | null;
  /** Present only for an uncurated tier — the explicit "unknown, not a guess". */
  advisory?: string;
};

export type SigningKey = {
  privateKeyPem: string;
  publicKeyPem: string;
  publicKeyFingerprint: string;
};

export type SafetyAttestation = SafetyDisclosure & {
  /** How the curated claim was (or was not) signed. Absent for uncurated places. */
  signing_status?: "signed" | "unsigned_no_key";
  attestation?: {
    scheme: typeof SAFETY_ATTESTATION_SCHEME;
    algorithm: "ed25519";
    canonical: string;
    hash: string;
    signature: string;
    key_fingerprint: string;
    public_key_url: string;
    verify: string;
  };
};

/**
 * Decide curated-vs-unknown and shape the disclosure. Pure and keyless: an
 * uncurated place returns ONLY the explicit "unknown, verify" advisory — no
 * tier label, no needs, no note that could imply curation.
 */
export function buildSafetyDisclosure(input: SafetyDisclosureInput): SafetyDisclosure {
  if (!isCuratedTier(input.tier)) {
    return {
      restaurant_id: input.restaurant_id,
      safety_tier: "unknown",
      curated: false,
      safety_label: safetyTierLabel("unknown"),
      advisory: UNCURATED_ADVISORY,
    };
  }

  const tier = input.tier as string;
  return {
    restaurant_id: input.restaurant_id,
    safety_tier: tier,
    curated: true,
    safety_label: safetyTierLabel(tier),
    as_of: input.as_of ?? null,
    ...(input.allergy_needs?.length ? { allergy_needs: input.allergy_needs } : {}),
    ...(input.allergy_safety_note ? { allergy_safety_note: input.allergy_safety_note } : {}),
  };
}

/**
 * Deterministic, explicitly-ordered canonical string for the tier claim.
 * Ordered by hand (not JSON) so a verifier reconstructs it unambiguously from
 * the returned fields, with no dependency on key-ordering rules.
 */
export function canonicalizeSafetyClaim(fields: {
  restaurant_id: string;
  tier: string;
  as_of: string | null;
  key_fingerprint: string;
}): string {
  return [
    SAFETY_ATTESTATION_SCHEME,
    fields.restaurant_id,
    fields.tier,
    fields.as_of ?? "",
    fields.key_fingerprint,
  ].join("|");
}

/**
 * Build a safety disclosure and, for a CURATED tier only, attach a signed
 * `fnm-safety-v1` attestation an agent can quote verbatim.
 *
 * The honesty gate is absolute: an uncurated place returns the disclosure with
 * NO `attestation` and NO signature. A curated place with no signing key
 * configured returns `signing_status: "unsigned_no_key"` rather than implying
 * a signature it cannot produce.
 *
 * @param opts.signingKey Inject a key (tests, custody rotation). Omit to load
 *   from env; pass `null` to force the unsigned path deterministically.
 */
export function buildSafetyAttestation(
  input: SafetyDisclosureInput,
  opts: { signingKey?: SigningKey | null } = {},
): SafetyAttestation {
  const disclosure = buildSafetyDisclosure(input);

  // HONESTY GATE: never sign a non-claim. An uncurated place returns the
  // disclosure verbatim — no attestation, no signature, ever.
  if (!disclosure.curated) return disclosure;

  const signingKey =
    opts.signingKey !== undefined ? opts.signingKey : loadSigningKeyFromEnv();

  if (!signingKey) {
    // Curated but unsigned: be explicit rather than implying a signature.
    return { ...disclosure, signing_status: "unsigned_no_key" };
  }

  const keyFingerprint =
    signingKey.publicKeyFingerprint ?? fingerprintPublicKey(signingKey.publicKeyPem);

  const canonical = canonicalizeSafetyClaim({
    restaurant_id: disclosure.restaurant_id,
    tier: disclosure.safety_tier,
    as_of: disclosure.as_of ?? null,
    key_fingerprint: keyFingerprint,
  });
  const hash = createHash("sha256").update(canonical).digest("hex");
  const signature = signMenuHash(hash, signingKey.privateKeyPem);

  return {
    ...disclosure,
    signing_status: "signed",
    attestation: {
      scheme: SAFETY_ATTESTATION_SCHEME,
      algorithm: "ed25519",
      canonical,
      hash,
      signature,
      key_fingerprint: keyFingerprint,
      public_key_url: PUBLIC_KEY_URL,
      verify:
        "Reconstruct `canonical`, sha256 it to reproduce `hash`, then Ed25519-verify " +
        "`signature` against the public key whose fingerprint matches `key_fingerprint` " +
        "at `public_key_url`.",
    },
  };
}
