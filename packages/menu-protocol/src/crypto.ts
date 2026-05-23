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
// Content-bound signature scheme: fnm-v1
//
// fnm-v0 (legacy) signed only the tuple `${restaurantId}:${menuId}:${signer}:${timestamp}`,
// which proves *an* owner approved *something* at a point in time but does
// not prove what menu contents were approved. If items were edited after
// approval, the legacy signature would still validate against the tuple.
//
// fnm-v1 binds the signature to the actual menu content by signing a hash
// derived from a canonical content fingerprint:
//
//   payload_hash    = sha256( stableStringify( canonicalMenuContent ) )
//   signing_input   = `fnm-v1:${restaurantId}:${menuId}:${signer}:${timestamp}:${payload_hash}`
//   signed_message  = sha256( signing_input )
//   signature       = ed25519_sign( signed_message, private_key )
//
// Verifiers (a) rebuild the canonical content from the menu response,
// (b) recompute payload_hash and assert it matches the stored value,
// (c) recompute signed_message, (d) verify the signature with the active
// public key from /.well-known/menu-signing-keys.json.
//
// The canonical content explicitly excludes IDs, timestamps, and computed
// presentation fields so that re-rendering, re-numbering, or re-keying the
// menu does not silently invalidate signatures.
// ============================================================================

export const MENU_SIGNATURE_FORMAT_V1 = "fnm-v1" as const;
export const MENU_SIGNATURE_FORMAT_LEGACY = "fnm-v0" as const;

/**
 * Minimal item fields that contribute to the content fingerprint. Anything
 * not in this list is excluded from the signature (popularity scores,
 * image URLs, internal IDs, etc.) so cosmetic edits don't invalidate
 * signatures and content edits always do.
 */
export type CanonicalMenuItem = {
  category_name: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  available: boolean;
  preparation_time_minutes: number | null;
  dietary_vegetarian: boolean;
  dietary_vegan: boolean;
  dietary_gluten_free: boolean;
  dietary_halal: boolean;
  dietary_kosher: boolean;
  dietary_nut_free: boolean;
  dietary_dairy_free: boolean;
  dietary_low_carb: boolean;
  dietary_keto: boolean;
  allergens: string[];
};

export type CanonicalMenuContent = {
  protocol_version: string;
  items: CanonicalMenuItem[];
};

/**
 * Build the canonical content fingerprint for a menu from its categories
 * and items rows. Inputs are normalized (sort categories by name, then
 * items by name+price, sort allergen arrays alphabetically) so that
 * trivial reordering of rows in the database does not change the hash.
 */
export function buildCanonicalMenuContent(input: {
  protocol_version: string;
  categories: Array<{ id: string; name: string }>;
  items: Array<{
    category_id: string;
    name: string;
    description?: string | null;
    price: number;
    currency: string;
    available: boolean;
    preparation_time_minutes?: number | null;
    dietary_vegetarian?: boolean;
    dietary_vegan?: boolean;
    dietary_gluten_free?: boolean;
    dietary_halal?: boolean;
    dietary_kosher?: boolean;
    dietary_nut_free?: boolean;
    dietary_dairy_free?: boolean;
    dietary_low_carb?: boolean;
    dietary_keto?: boolean;
    allergens?: string[] | null;
  }>;
}): CanonicalMenuContent {
  const categoryNameById = new Map<string, string>();
  for (const cat of input.categories) categoryNameById.set(cat.id, cat.name);

  const items: CanonicalMenuItem[] = input.items.map((item) => ({
    category_name: categoryNameById.get(item.category_id) ?? "",
    name: item.name,
    description: item.description ?? null,
    price: item.price,
    currency: item.currency,
    available: item.available,
    preparation_time_minutes: item.preparation_time_minutes ?? null,
    dietary_vegetarian: item.dietary_vegetarian ?? false,
    dietary_vegan: item.dietary_vegan ?? false,
    dietary_gluten_free: item.dietary_gluten_free ?? false,
    dietary_halal: item.dietary_halal ?? false,
    dietary_kosher: item.dietary_kosher ?? false,
    dietary_nut_free: item.dietary_nut_free ?? false,
    dietary_dairy_free: item.dietary_dairy_free ?? false,
    dietary_low_carb: item.dietary_low_carb ?? false,
    dietary_keto: item.dietary_keto ?? false,
    allergens: [...(item.allergens ?? [])].sort(),
  }));

  items.sort((a, b) => {
    if (a.category_name !== b.category_name) return a.category_name < b.category_name ? -1 : 1;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.price !== b.price) return a.price - b.price;
    return 0;
  });

  return {
    protocol_version: input.protocol_version,
    items,
  };
}

/** SHA-256 of stableStringify(content), hex. */
export function computeMenuPayloadHash(content: CanonicalMenuContent): string {
  return createHash("sha256").update(stableStringify(content)).digest("hex");
}

/** The exact string that gets sha256'd and signed under fnm-v1. */
export function buildMenuSigningInput(args: {
  restaurantId: string;
  menuId: string;
  signer: string;
  timestamp: string;
  payloadHash: string;
}): string {
  return `${MENU_SIGNATURE_FORMAT_V1}:${args.restaurantId}:${args.menuId}:${args.signer}:${args.timestamp}:${args.payloadHash}`;
}

/**
 * Sign a menu's canonical content under fnm-v1. Returns the base64url
 * signature plus the payload_hash that callers should store and expose
 * so verifiers can re-derive the signing input.
 */
export function signMenuContent(args: {
  content: CanonicalMenuContent;
  restaurantId: string;
  menuId: string;
  signer: string;
  timestamp: string;
  privateKeyPem: string;
}): { signature: string; payload_hash: string; signing_format: typeof MENU_SIGNATURE_FORMAT_V1 } {
  const payloadHash = computeMenuPayloadHash(args.content);
  const signingInput = buildMenuSigningInput({
    restaurantId: args.restaurantId,
    menuId: args.menuId,
    signer: args.signer,
    timestamp: args.timestamp,
    payloadHash,
  });
  const signingDigest = createHash("sha256").update(signingInput).digest("hex");
  const signature = signMenuHash(signingDigest, args.privateKeyPem);
  return {
    signature,
    payload_hash: payloadHash,
    signing_format: MENU_SIGNATURE_FORMAT_V1,
  };
}

/**
 * Verify a fnm-v1 content-bound menu signature. The verifier supplies the
 * full content (typically rebuilt from a `get_menu` / `menu.mp` response),
 * and this function re-derives both payload_hash and signing input before
 * checking the Ed25519 signature.
 *
 * Returns a structured result so callers can report exactly which step
 * failed when surfacing diagnostics to agents.
 */
export type ContentVerificationResult = {
  valid: boolean;
  reason?:
    | "payload_hash_mismatch"
    | "signature_invalid"
    | "missing_public_key";
  computed_payload_hash: string;
};

export function verifyMenuContentSignature(args: {
  content: CanonicalMenuContent;
  restaurantId: string;
  menuId: string;
  signer: string;
  timestamp: string;
  expectedPayloadHash: string;
  signature: string;
  publicKeyPem: string;
}): ContentVerificationResult {
  if (!args.publicKeyPem) {
    return { valid: false, reason: "missing_public_key", computed_payload_hash: "" };
  }
  const computedPayloadHash = computeMenuPayloadHash(args.content);
  if (computedPayloadHash !== args.expectedPayloadHash) {
    return {
      valid: false,
      reason: "payload_hash_mismatch",
      computed_payload_hash: computedPayloadHash,
    };
  }
  const signingInput = buildMenuSigningInput({
    restaurantId: args.restaurantId,
    menuId: args.menuId,
    signer: args.signer,
    timestamp: args.timestamp,
    payloadHash: args.expectedPayloadHash,
  });
  const signingDigest = createHash("sha256").update(signingInput).digest("hex");
  const sigValid = verifyMenuSignature(signingDigest, args.signature, args.publicKeyPem);
  return {
    valid: sigValid,
    reason: sigValid ? undefined : "signature_invalid",
    computed_payload_hash: computedPayloadHash,
  };
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
