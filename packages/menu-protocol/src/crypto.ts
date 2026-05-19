import { createHash } from "crypto";
import { MenuProtocol } from "./schema";

/**
 * Deterministic JSON stringify that sorts keys at all levels.
 * This ensures the same object always produces the same string,
 * which is critical for reproducible hashing.
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
 * Generates a SHA-256 hash of the Menu Protocol payload.
 * This ensures the exact state of the menu (prices, allergens, dietary tags)
 * is captured at the moment of approval.
 * 
 * Uses deterministic JSON stringification so the hash is reproducible.
 */
export function hashMenuPayload(menu: Omit<MenuProtocol, "restaurant"> & { restaurant: Omit<MenuProtocol["restaurant"], "signature"> }): string {
  const payloadString = stableStringify(menu);
  return createHash("sha256").update(payloadString).digest("hex");
}

/**
 * PLACEHOLDER: Simulates signing the menu hash.
 * 
 * In production, replace with:
 * - EIP-712 typed data signature (for Web3 wallet signing)
 * - Ed25519 signature (for server-side KMS)
 * - RSA-PSS signature (for traditional PKI)
 * 
 * DO NOT use this placeholder for real liability protection.
 */
export function signMenuHash(hash: string, _privateKey: string): string {
  // TODO: Replace with real signature (ethers.js wallet.signTypedData, AWS KMS, etc.)
  return `PLACEHOLDER_SIG_${hash.slice(0, 16)}`;
}

/**
 * PLACEHOLDER: Validates that the signature matches the payload hash.
 * 
 * In production, implement actual verification against the signer's public key.
 * 
 * DO NOT use this placeholder for real liability protection.
 */
export function verifyMenuSignature(_hash: string, signature: string, _publicKey: string): boolean {
  // TODO: Replace with real verification
  if (signature.startsWith("PLACEHOLDER_SIG_")) {
    console.warn("verifyMenuSignature: Using placeholder verification. Not cryptographically secure.");
    return true;
  }
  return false;
}
