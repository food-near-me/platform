#!/usr/bin/env npx tsx
/**
 * Generate a fresh Ed25519 signing key pair for the `verified` Menu Protocol tier.
 *
 * Usage:
 *   npm run gen:signing-key
 *
 * Output is two PEM blocks (private + public) plus single-line escaped versions
 * suitable for pasting into Vercel/`.env`. Treat the private key as a secret;
 * commit nothing. Rotation: generate a new pair, deploy, re-sign affected menus.
 */

import { generateSigningKeyPair } from "@foodnearme/menu-protocol";

function escapeNewlines(pem: string): string {
  return pem.trim().replace(/\n/g, "\\n");
}

function main(): void {
  const { privateKeyPem, publicKeyPem, publicKeyFingerprint } = generateSigningKeyPair();

  console.log("=== Ed25519 signing key pair for foodnear.me verified tier ===");
  console.log();
  console.log(`Public key fingerprint (SHA-256): ${publicKeyFingerprint}`);
  console.log();
  console.log("--- PEM (human-readable) ---");
  console.log(privateKeyPem.trim());
  console.log();
  console.log(publicKeyPem.trim());
  console.log();
  console.log("--- .env / Vercel single-line ---");
  console.log(`FNM_VERIFIED_SIGNING_KEY="${escapeNewlines(privateKeyPem)}"`);
  console.log(`FNM_VERIFIED_SIGNING_PUBLIC_KEY="${escapeNewlines(publicKeyPem)}"`);
  console.log();
  console.log("Next steps:");
  console.log("  1. Add both env vars to Vercel (Production + Preview)");
  console.log("  2. Add only the PUBLIC key to .env.local if you want to verify locally");
  console.log("  3. Store the PRIVATE key in your password manager or KMS");
  console.log("  4. Never commit the private key to git");
}

main();
