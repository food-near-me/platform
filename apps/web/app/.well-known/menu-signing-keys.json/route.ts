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

  if (!signing) {
    return NextResponse.json(
      {
        active_key: null,
        rotated_keys: rotated,
        configured: false,
        generated_at: generatedAt,
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
      },
      rotated_keys: rotated,
      configured: true,
      generated_at: generatedAt,
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
