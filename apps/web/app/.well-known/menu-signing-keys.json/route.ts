import { NextResponse } from "next/server";
import { loadSigningKeyFromEnv } from "@foodnearme/menu-protocol";

/**
 * Public registry of active and rotated Ed25519 keys used to sign verified
 * Menu Protocol payloads. Agents fetch this file to verify a `get_menu`
 * signature offline:
 *
 *   1. Read `signature.signer` (or `signature.algorithm + hash`) on the menu.
 *   2. Find the matching fingerprint in `active_key` or `rotated_keys[]`.
 *   3. Use `public_key_pem` with the standard Ed25519 verify primitive.
 *
 * The route reads from environment so that key rotation propagates without a
 * code redeploy: update `FNM_VERIFIED_SIGNING_PUBLIC_KEY`, push the previous
 * key into `FNM_VERIFIED_SIGNING_ROTATED_KEYS` (JSON), and this endpoint
 * reflects the change immediately.
 *
 * Format is intentionally close to JWKS but PEM-based (matches the on-disk
 * format we already use elsewhere in the repo).
 */

type RotatedKey = {
  algorithm: "ed25519";
  fingerprint: string;
  public_key_pem: string;
  rotated_at: string;
  reason?: string;
};

function parseRotatedKeys(): RotatedKey[] {
  const raw = process.env.FNM_VERIFIED_SIGNING_ROTATED_KEYS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RotatedKey =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            "fingerprint" in entry &&
            "public_key_pem" in entry &&
            "rotated_at" in entry,
        ),
    );
  } catch {
    return [];
  }
}

export async function GET() {
  const signing = loadSigningKeyFromEnv();
  const rotated = parseRotatedKeys();
  const generatedAt = new Date().toISOString();

  const formats = {
    "fnm-v1": {
      content_bound: true,
      signing_input: "fnm-v1:${restaurant_id}:${menu_id}:${signer}:${timestamp}:${payload_hash}",
      signed_message: "sha256(signing_input)",
      payload_hash: "sha256(stableStringify(canonical_content))",
      canonical_content_spec:
        "buildCanonicalMenuContent() in @foodnearme/menu-protocol/src/crypto.ts — sorts items by category_name then name then price, sorts allergen arrays alphabetically, includes only content fields (excludes IDs, timestamps, popularity_score, customization_options).",
      verifier_steps: [
        "Fetch /api/v1/restaurant/{id}/menu.mp.",
        "Rebuild canonical content via buildCanonicalMenuContent on the response's items.",
        "Compute payload_hash = computeMenuPayloadHash(canonical_content); assert it equals signature.payload_hash.",
        "Compute signing_input string; compute sha256(signing_input).",
        "Ed25519 verify signature.signature against the sha256, using active_key.public_key_pem.",
      ],
    },
    "fnm-v0": {
      content_bound: false,
      signing_input: "${restaurant_id}:${menu_id}:${signer}:${timestamp}",
      signed_message: "sha256(signing_input)",
      note:
        "Legacy format. Proves owner approval at signing_timestamp but does NOT bind to current menu contents. Treat content changes since signature_timestamp with caution.",
    },
  };

  if (!signing) {
    return NextResponse.json(
      {
        active_key: null,
        rotated_keys: rotated,
        configured: false,
        generated_at: generatedAt,
        signing_formats: formats,
        verification_instructions:
          "Ed25519 verify against the menu payload hash from get_menu. See https://foodnear.me/SKILL.md#verifying-signatures.",
        note: "No active signing key is configured in this environment. Signatures on get_menu responses for the `verified` tier should not be trusted until this endpoint reports an active_key.",
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }

  return NextResponse.json(
    {
      active_key: {
        algorithm: "ed25519",
        fingerprint: signing.publicKeyFingerprint,
        public_key_pem: signing.publicKeyPem,
        usage: "menu-protocol-v1-signature",
        supported_formats: ["fnm-v0", "fnm-v1"],
      },
      rotated_keys: rotated,
      configured: true,
      generated_at: generatedAt,
      signing_formats: formats,
      verification_instructions:
        "Ed25519 verify against the menu payload hash from get_menu. See https://foodnear.me/SKILL.md#verifying-signatures.",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
