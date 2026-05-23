import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "crypto";
import { MenuProtocol } from "./schema";

/**
 * Deterministic JSON stringify that sorts keys at all levels.
 * Ensures the same object always produces the same string,
 * which is required for reproducible hashing across machines and clients.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }

  const keys = Object.keys(obj).sort();
  const pairs = keys.map(
    (key) => JSON.stringify(key) + ":" + stableStringify((obj as Record<string, unknown>)[key])
  );
  return "{" + pairs.join(",") + "}";
}

/**
 * SHA-256 hash of the Menu Protocol payload using deterministic stringify.
 * Captures the exact state of the menu (prices, allergens, dietary tags) at
 * approval time. The hash is what gets signed; the signature proves owner intent.
 */
export function hashMenuPayload(
  menu: Omit<MenuProtocol, "restaurant"> & {
    restaurant: Omit<MenuProtocol["restaurant"], "signature">;
  },
): string {
  const payloadString = stableStringify(menu);
  return createHash("sha256").update(payloadString).digest("hex");
}

// ============================================================================
// Ed25519 Signing
// ============================================================================

const PEM_PRIVATE_HEADER = "-----BEGIN PRIVATE KEY-----";
const PEM_PUBLIC_HEADER = "-----BEGIN PUBLIC KEY-----";

export type Ed25519KeyPair = {
  /** PEM-encoded PKCS#8 private key. Keep secret. */
  privateKeyPem: string;
  /** PEM-encoded SPKI public key. Distribute freely. */
  publicKeyPem: string;
  /** SHA-256 fingerprint of the public key, hex-encoded. Useful for key rotation. */
  publicKeyFingerprint: string;
};

/**
 * Generate a fresh Ed25519 key pair for signing Menu Protocol payloads.
 *
 * Run once per signing identity (project-level for now; per-restaurant when
 * owner key custody ships). The private key MUST be stored in a secret store
 * (env var, AWS Secrets Manager, etc) and never committed to source control.
 */
export function generateSigningKeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const publicKeyFingerprint = fingerprintPublicKey(publicKeyPem);

  return { privateKeyPem, publicKeyPem, publicKeyFingerprint };
}

/**
 * SHA-256 fingerprint of a PEM-encoded public key, used to identify which
 * key signed a given menu when keys are rotated.
 */
export function fingerprintPublicKey(publicKeyPem: string): string {
  return createHash("sha256")
    .update(normalizePem(publicKeyPem, "PUBLIC"))
    .digest("hex");
}

/**
 * Sign a Menu Protocol payload hash using an Ed25519 private key.
 *
 * Returns a base64url-encoded signature suitable for storage in
 * `menus.signature_hash` and inclusion in `get_menu` MCP responses.
 *
 * @param hash hex-encoded SHA-256 hash from {@link hashMenuPayload}
 * @param privateKeyPem PEM-encoded PKCS#8 Ed25519 private key
 */
export function signMenuHash(hash: string, privateKeyPem: string): string {
  if (!hash || typeof hash !== "string") {
    throw new Error("signMenuHash: hash must be a non-empty hex string");
  }
  if (!privateKeyPem || !privateKeyPem.includes(PEM_PRIVATE_HEADER)) {
    throw new Error(
      "signMenuHash: privateKeyPem must be a PEM-encoded PKCS#8 Ed25519 private key. " +
        "Generate one with generateSigningKeyPair() and load via loadSigningKeyFromEnv().",
    );
  }

  const keyObject = createPrivateKey({ key: privateKeyPem, format: "pem" });
  const signature = sign(null, Buffer.from(hash, "hex"), keyObject);
  return signature.toString("base64url");
}

/**
 * Verify that a base64url-encoded Ed25519 signature matches the payload hash
 * for the given public key. Returns true only on valid signatures.
 */
export function verifyMenuSignature(
  hash: string,
  signatureBase64Url: string,
  publicKeyPem: string,
): boolean {
  if (!hash || !signatureBase64Url || !publicKeyPem) return false;
  if (!publicKeyPem.includes(PEM_PUBLIC_HEADER)) return false;

  try {
    const keyObject = createPublicKey({ key: publicKeyPem, format: "pem" });
    const signatureBuffer = Buffer.from(signatureBase64Url, "base64url");
    return verify(null, Buffer.from(hash, "hex"), keyObject, signatureBuffer);
  } catch {
    return false;
  }
}

/**
 * Load the project signing key from environment variables.
 *
 * Env vars:
 * - `FNM_VERIFIED_SIGNING_KEY` — PEM-encoded PKCS#8 Ed25519 private key.
 *   Newlines may be escaped as `\n` for single-line storage (Vercel, .env).
 *   Bare base64 (the body between the PEM headers) is also accepted and
 *   wrapped automatically, so a copy-paste of just the middle slice works.
 * - `FNM_VERIFIED_SIGNING_PUBLIC_KEY` — corresponding PEM-encoded SPKI public
 *   key. Same flexibility applies (full PEM or just the base64 body).
 *
 * Returns `null` when not configured so callers can fall back to unsigned
 * pending states without crashing the verify flow.
 */
export function loadSigningKeyFromEnv(): {
  privateKeyPem: string;
  publicKeyPem: string;
  publicKeyFingerprint: string;
} | null {
  const rawPrivate = process.env.FNM_VERIFIED_SIGNING_KEY;
  const rawPublic = process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY;
  if (!rawPrivate || !rawPublic) return null;

  const privateKeyPem = normalizePem(rawPrivate, "PRIVATE");
  const publicKeyPem = normalizePem(rawPublic, "PUBLIC");

  return {
    privateKeyPem,
    publicKeyPem,
    publicKeyFingerprint: fingerprintPublicKey(publicKeyPem),
  };
}

function normalizePem(value: string, kind: "PRIVATE" | "PUBLIC"): string {
  const header = kind === "PRIVATE" ? PEM_PRIVATE_HEADER : PEM_PUBLIC_HEADER;
  const footer = kind === "PRIVATE" ? "-----END PRIVATE KEY-----" : "-----END PUBLIC KEY-----";

  const unescaped = value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
  const trimmed = unescaped.trim();

  if (trimmed.includes(header)) {
    return trimmed + "\n";
  }

  // Accept a bare base64 body (no headers, no newlines) and wrap it.
  const stripped = trimmed.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(stripped) || stripped.length < 40) {
    throw new Error(
      `Expected a PEM block beginning with "${header}" or a base64-encoded ${kind.toLowerCase()} key body`,
    );
  }
  const wrapped = stripped.match(/.{1,64}/g)?.join("\n") ?? stripped;
  return `${header}\n${wrapped}\n${footer}\n`;
}
