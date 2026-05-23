import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningKeyFromEnv, signMenuHash } from "@foodnearme/menu-protocol";
import type { MenuCategorySeed } from "./types";

async function insertCategoriesAndItems(
  supabase: SupabaseClient,
  menuId: string,
  categories: MenuCategorySeed[],
): Promise<number> {
  let itemCount = 0;

  for (let catIdx = 0; catIdx < categories.length; catIdx++) {
    const cat = categories[catIdx];

    const { data: category, error: catError } = await supabase
      .from("menu_categories")
      .insert({
        menu_id: menuId,
        name: cat.name,
        sort_order: catIdx,
      })
      .select("id")
      .single();

    if (catError || !category) {
      throw new Error(`Category insert failed: ${catError?.message}`);
    }

    for (const item of cat.items) {
      // Every dietary flag defaults to FALSE unless the parser/seed sets it
      // TRUE on an explicit positive signal. Inferring nut_free=TRUE from the
      // absence of nut allergens caused false positive nut-free claims on
      // indexed menus (Phase 3a fix); the backfill in 20260523_dietary_9flag.sql
      // cleared those rows.
      const { error: itemError } = await supabase.from("menu_items").insert({
        category_id: category.id,
        name: item.name,
        description: item.description ?? "",
        price: item.price,
        currency: "USD",
        available: true,
        preparation_time_minutes: item.prep_time ?? 15,
        dietary_vegetarian: item.dietary_vegetarian ?? false,
        dietary_vegan: item.dietary_vegan ?? false,
        dietary_gluten_free: item.dietary_gluten_free ?? false,
        dietary_halal: item.dietary_halal ?? false,
        dietary_kosher: item.dietary_kosher ?? false,
        dietary_nut_free: item.dietary_nut_free ?? false,
        dietary_dairy_free: item.dietary_dairy_free ?? false,
        dietary_low_carb: item.dietary_low_carb ?? false,
        dietary_keto: item.dietary_keto ?? false,
        allergens: item.allergens ?? [],
        popularity_score: 3.0,
      });

      if (itemError) {
        throw new Error(`Item insert failed (${item.name}): ${itemError.message}`);
      }
      itemCount++;
    }
  }

  return itemCount;
}

async function deleteMenusByStatus(
  supabase: SupabaseClient,
  restaurantId: string,
  status: string,
): Promise<void> {
  const { data: menus } = await supabase
    .from("menus")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", status);

  if (!menus?.length) return;

  for (const menu of menus) {
    await supabase.from("menus").delete().eq("id", menu.id);
  }
}

export async function refreshPublishedIndexedMenu(
  supabase: SupabaseClient,
  restaurantId: string,
  categories: MenuCategorySeed[],
  menuSource: string,
): Promise<{ itemCount: number; menuId: string }> {
  await deleteMenusByStatus(supabase, restaurantId, "published");

  const { data: menu, error: menuError } = await supabase
    .from("menus")
    .insert({
      restaurant_id: restaurantId,
      protocol_version: "1.0",
      status: "published",
    })
    .select("id")
    .single();

  if (menuError || !menu) {
    throw new Error(`Menu insert failed: ${menuError?.message}`);
  }

  const itemCount = await insertCategoriesAndItems(supabase, menu.id, categories);

  const { error: statusError } = await supabase
    .from("restaurants")
    .update({
      verification_status: "menu_indexed",
      source: menuSource,
      updated_at: new Date().toISOString(),
    })
    .eq("id", restaurantId)
    .neq("verification_status", "verified");

  if (statusError) {
    throw new Error(`Status update failed: ${statusError.message}`);
  }

  return { itemCount, menuId: menu.id };
}

export async function insertPublishedIndexedMenu(
  supabase: SupabaseClient,
  restaurantId: string,
  categories: MenuCategorySeed[],
  menuSource: string,
): Promise<{ itemCount: number; menuId: string }> {
  const { data: existingMenu } = await supabase
    .from("menus")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "published")
    .maybeSingle();

  let menuId = existingMenu?.id;

  if (!menuId) {
    const { data: menu, error: menuError } = await supabase
      .from("menus")
      .insert({
        restaurant_id: restaurantId,
        protocol_version: "1.0",
        status: "published",
      })
      .select("id")
      .single();

    if (menuError || !menu) {
      throw new Error(`Menu insert failed: ${menuError?.message}`);
    }
    menuId = menu.id;
  }

  const itemCount = await insertCategoriesAndItems(supabase, menuId, categories);

  const { error: statusError } = await supabase
    .from("restaurants")
    .update({
      verification_status: "menu_indexed",
      source: menuSource,
      updated_at: new Date().toISOString(),
    })
    .eq("id", restaurantId)
    .neq("verification_status", "verified");

  if (statusError) {
    throw new Error(`Status update failed: ${statusError.message}`);
  }

  return { itemCount, menuId };
}

export async function insertPendingMenu(
  supabase: SupabaseClient,
  restaurantId: string,
  categories: MenuCategorySeed[],
): Promise<{ itemCount: number; menuId: string }> {
  await deleteMenusByStatus(supabase, restaurantId, "pending_approval");

  const { data: menu, error: menuError } = await supabase
    .from("menus")
    .insert({
      restaurant_id: restaurantId,
      protocol_version: "1.0",
      status: "pending_approval",
    })
    .select("id")
    .single();

  if (menuError || !menu) {
    throw new Error(`Pending menu insert failed: ${menuError?.message}`);
  }

  const itemCount = await insertCategoriesAndItems(supabase, menu.id, categories);
  return { itemCount, menuId: menu.id };
}

async function pickCandidateMenuId(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<string | undefined> {
  const { data: pending } = await supabase
    .from("menus")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending_approval")
    .maybeSingle();

  if (pending?.id) return pending.id;

  const { data: published } = await supabase
    .from("menus")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "published")
    .maybeSingle();

  return published?.id;
}

/**
 * Race-safe owner approval for a restaurant's menu.
 *
 * Concurrent approve requests for the same restaurant (double-click,
 * network retry, multiple browser tabs) used to be able to interleave
 * between the legacy multi-statement read-then-write flow, leaving the
 * database in an inconsistent state (orphaned menus, missing signatures,
 * or duplicate "verified" stamps with different timestamps).
 *
 * The current flow:
 *
 *   1. Short-circuit when the restaurant is already verified.
 *   2. Read the current pending/published menu to pick a candidate
 *      `menu_id` to sign against.
 *   3. Compute the Ed25519 signature in Node (the private key never
 *      leaves the runtime).
 *   4. Call `approve_menu_verification_atomic` which locks the
 *      restaurants row `FOR UPDATE`, validates the candidate is still
 *      the live menu, and performs the entire pending->published swap +
 *      signature attach + restaurant flip in a single transaction.
 *   5. If the RPC reports `menu_state_changed` (a concurrent caller beat
 *      us between the read and the lock), re-read state, re-sign, and
 *      retry up to MAX_RETRIES times.
 *
 * MAX_RETRIES is deliberately small: in steady state we'd expect ~zero
 * collisions, and retrying more than a few times suggests something else
 * is wrong (e.g. an ingest loop racing with verification) that humans
 * should look at rather than the function silently retrying forever.
 */
const APPROVE_MAX_RETRIES = 3;

export async function approveMenuVerification(
  supabase: SupabaseClient,
  restaurantId: string,
  signerEmail: string,
): Promise<{ menuId: string; alreadyVerified: boolean }> {
  // Fast path: caller-friendly "already verified" check so we don't
  // bother computing a signature when there's nothing to do.
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id, verification_status")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    throw new Error("Restaurant not found");
  }

  if (restaurant.verification_status === "verified") {
    const { data: published } = await supabase
      .from("menus")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("status", "published")
      .maybeSingle();
    return { menuId: published?.id ?? "", alreadyVerified: true };
  }

  const signingKey = loadSigningKeyFromEnv();
  if (!signingKey) {
    throw new Error(
      "Cannot verify menu: FNM_VERIFIED_SIGNING_KEY and FNM_VERIFIED_SIGNING_PUBLIC_KEY " +
        "are not configured. Generate a key pair with `npm run gen:signing-key` and add to env.",
    );
  }
  const signerIdentity = `${signerEmail}|fnm-server:${signingKey.publicKeyFingerprint.slice(0, 16)}`;

  for (let attempt = 0; attempt < APPROVE_MAX_RETRIES; attempt++) {
    const candidateMenuId = await pickCandidateMenuId(supabase, restaurantId);
    if (!candidateMenuId) {
      throw new Error("No menu available to verify");
    }

    const timestamp = new Date().toISOString();
    const hashPayload = `${restaurantId}:${candidateMenuId}:${signerEmail}:${timestamp}`;
    const payloadHash = createHash("sha256").update(hashPayload).digest("hex");
    const signature = signMenuHash(payloadHash, signingKey.privateKeyPem);

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "approve_menu_verification_atomic",
      {
        p_restaurant_id: restaurantId,
        p_expected_menu_id: candidateMenuId,
        p_signature_hash: signature,
        p_signature_signer: signerIdentity,
        p_signature_timestamp: timestamp,
      },
    );

    if (rpcError) {
      // Postgres exceptions raised inside the function (restaurant_not_found,
      // no_menu_available) surface here. Map back to the legacy error
      // messages so the calling route's status mapper still works.
      const message = rpcError.message ?? "";
      if (message.includes("restaurant_not_found")) {
        throw new Error("Restaurant not found");
      }
      if (message.includes("no_menu_available")) {
        throw new Error("No menu available to verify");
      }
      throw new Error(`Approval RPC failed: ${message || "unknown error"}`);
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row) {
      throw new Error("Approval RPC returned no result row");
    }

    if (row.menu_state_changed) {
      // Lost the race; the menu we just signed against is no longer
      // the live menu. Re-read & re-sign in the next iteration.
      continue;
    }

    return {
      menuId: row.menu_id ?? candidateMenuId,
      alreadyVerified: row.already_verified,
    };
  }

  throw new Error(
    "Could not approve menu: menu state changed during signing after multiple retries. Please retry the request.",
  );
}
