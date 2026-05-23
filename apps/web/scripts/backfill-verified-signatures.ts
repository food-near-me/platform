#!/usr/bin/env npx tsx
/**
 * One-off backfill: re-sign every `verified` restaurant's published menu with
 * the new Ed25519 key. Required after replacing the placeholder signing
 * scheme (see packages/menu-protocol/src/crypto.ts).
 *
 * Behavior:
 *   - Lists every restaurant where verification_status = 'verified'.
 *   - For each, finds the published menu.
 *   - If the menu's signature_hash is missing or matches the PLACEHOLDER_SIG_*
 *     pattern, computes a fresh hash + Ed25519 signature and writes them back.
 *   - Skips already-Ed25519-signed menus unless --force is passed.
 *
 * Usage:
 *   cd apps/web
 *   tsx scripts/backfill-verified-signatures.ts [--force] [--dry-run]
 *
 * Requires (read from .env.local at repo root):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - FNM_VERIFIED_SIGNING_KEY
 *   - FNM_VERIFIED_SIGNING_PUBLIC_KEY
 */

import { createHash } from "node:crypto";
import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), "..", "..", ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { loadSigningKeyFromEnv, signMenuHash } from "@foodnearme/menu-protocol";

type Args = { force: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  return {
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry-run") || argv.includes("--dry"),
  };
}

function isPlaceholder(sig: string | null): boolean {
  if (!sig) return true;
  return sig.startsWith("PLACEHOLDER_SIG_");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const signing = loadSigningKeyFromEnv();
  if (!signing) {
    console.error(
      "Missing FNM_VERIFIED_SIGNING_KEY / FNM_VERIFIED_SIGNING_PUBLIC_KEY in env.",
    );
    console.error("Generate with: npm run gen:signing-key (from apps/web)");
    process.exit(1);
  }
  console.log(`Signing key fingerprint: ${signing.publicKeyFingerprint.slice(0, 32)}...`);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: restaurants, error: rErr } = await supabase
    .from("restaurants")
    .select("id, name, slug")
    .eq("verification_status", "verified");

  if (rErr) {
    console.error("Failed to list verified restaurants:", rErr.message);
    process.exit(1);
  }

  console.log(`Found ${restaurants?.length ?? 0} verified restaurant(s).`);
  if (!restaurants || restaurants.length === 0) return;

  let updated = 0;
  let skipped = 0;
  let missingMenu = 0;

  for (const r of restaurants) {
    const { data: menu, error: mErr } = await supabase
      .from("menus")
      .select("id, signature_hash, signature_signer, signature_timestamp")
      .eq("restaurant_id", r.id)
      .eq("status", "published")
      .maybeSingle();

    if (mErr) {
      console.error(`  ! ${r.name}: failed to fetch menu — ${mErr.message}`);
      continue;
    }
    if (!menu) {
      console.log(`  - ${r.name}: no published menu — skipping`);
      missingMenu++;
      continue;
    }

    const needsBackfill = args.force || isPlaceholder(menu.signature_hash);
    if (!needsBackfill) {
      console.log(`  · ${r.name}: already has real signature — skipping`);
      skipped++;
      continue;
    }

    const signer = menu.signature_signer ?? "system-backfill@foodnear.me";
    const timestamp = new Date().toISOString();
    const hashPayload = `${r.id}:${menu.id}:${signer}:${timestamp}`;
    const payloadHash = createHash("sha256").update(hashPayload).digest("hex");
    const signature = signMenuHash(payloadHash, signing.privateKeyPem);
    const signerIdentity = signer.includes("|fnm-server:")
      ? signer
      : `${signer.split("|")[0]}|fnm-server:${signing.publicKeyFingerprint.slice(0, 16)}`;

    if (args.dryRun) {
      console.log(
        `  ⓘ ${r.name}: would replace signature (was=${menu.signature_hash ?? "null"})`,
      );
      continue;
    }

    const { error: updErr } = await supabase
      .from("menus")
      .update({
        signature_hash: signature,
        signature_signer: signerIdentity,
        signature_timestamp: timestamp,
        updated_at: timestamp,
      })
      .eq("id", menu.id);

    if (updErr) {
      console.error(`  ! ${r.name}: update failed — ${updErr.message}`);
      continue;
    }

    console.log(`  ✓ ${r.name}: signed (${signature.slice(0, 20)}...)`);
    updated++;
  }

  console.log("");
  console.log(`Summary: updated=${updated}, skipped=${skipped}, missing_menu=${missingMenu}`);
  if (args.dryRun) console.log("(dry-run — no rows changed)");
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
