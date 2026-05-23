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

export async function approveMenuVerification(
  supabase: SupabaseClient,
  restaurantId: string,
  signerEmail: string,
): Promise<{ menuId: string; alreadyVerified: boolean }> {
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select("id, name, verification_status")
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

  const { data: pendingMenu } = await supabase
    .from("menus")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "pending_approval")
    .maybeSingle();

  const { data: publishedMenu } = await supabase
    .from("menus")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "published")
    .maybeSingle();

  const menuId = pendingMenu?.id ?? publishedMenu?.id;
  if (!menuId) {
    throw new Error("No menu available to verify");
  }

  if (pendingMenu?.id) {
    if (publishedMenu?.id) {
      await supabase.from("menus").delete().eq("id", publishedMenu.id);
    }

    const { error: publishError } = await supabase
      .from("menus")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", pendingMenu.id);

    if (publishError) {
      throw new Error(`Failed to publish menu: ${publishError.message}`);
    }
  }

  const timestamp = new Date().toISOString();
  const signingKey = loadSigningKeyFromEnv();

  if (!signingKey) {
    throw new Error(
      "Cannot verify menu: FNM_VERIFIED_SIGNING_KEY and FNM_VERIFIED_SIGNING_PUBLIC_KEY " +
        "are not configured. Generate a key pair with `npm run gen:signing-key` and add to env.",
    );
  }

  const hashPayload = `${restaurantId}:${menuId}:${signerEmail}:${timestamp}`;
  const payloadHash = createHash("sha256").update(hashPayload).digest("hex");
  const signature = signMenuHash(payloadHash, signingKey.privateKeyPem);
  const signerIdentity = `${signerEmail}|fnm-server:${signingKey.publicKeyFingerprint.slice(0, 16)}`;

  const { error: signatureError } = await supabase
    .from("menus")
    .update({
      signature_hash: signature,
      signature_signer: signerIdentity,
      signature_timestamp: timestamp,
      updated_at: timestamp,
    })
    .eq("id", menuId);

  if (signatureError) {
    throw new Error(`Failed to sign menu: ${signatureError.message}`);
  }

  const { error: verifyError } = await supabase
    .from("restaurants")
    .update({
      verification_status: "verified",
      source: "owner_verified",
      updated_at: timestamp,
    })
    .eq("id", restaurantId);

  if (verifyError) {
    throw new Error(`Failed to verify restaurant: ${verifyError.message}`);
  }

  return { menuId, alreadyVerified: false };
}
