import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimVerificationRecord = {
  id: string;
  email: string;
  restaurant_id: string;
  expires_at: string;
  used_at: string | null;
};

const CLAIM_TOKEN_BYTES = 32;
const CLAIM_TOKEN_TTL_HOURS = 24;

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createRawClaimToken(): string {
  return randomBytes(CLAIM_TOKEN_BYTES).toString("base64url");
}

function claimTokenExpiry(): string {
  return new Date(Date.now() + CLAIM_TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

export async function createClaimVerificationToken(
  supabase: SupabaseClient,
  restaurantId: string,
  email: string,
): Promise<{ token: string; expiresAt: string }> {
  const token = createRawClaimToken();
  const expiresAt = claimTokenExpiry();

  const { error } = await supabase.from("claim_verification_tokens").insert({
    restaurant_id: restaurantId,
    email,
    token_hash: hashClaimToken(token),
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`Failed to create claim verification token: ${error.message}`);
  }

  return { token, expiresAt };
}

export async function validateClaimVerificationToken(
  supabase: SupabaseClient,
  restaurantId: string,
  token: string | null | undefined,
): Promise<ClaimVerificationRecord | null> {
  const trimmed = token?.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from("claim_verification_tokens")
    .select("id, email, restaurant_id, expires_at, used_at")
    .eq("restaurant_id", restaurantId)
    .eq("token_hash", hashClaimToken(trimmed))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  return data as ClaimVerificationRecord;
}

export async function consumeClaimVerificationToken(
  supabase: SupabaseClient,
  tokenId: string,
): Promise<void> {
  const { error } = await supabase
    .from("claim_verification_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenId)
    .is("used_at", null);

  if (error) {
    throw new Error(`Failed to consume claim verification token: ${error.message}`);
  }
}
