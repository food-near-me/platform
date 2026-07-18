"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/db/neon";
import { isOpsAuthed } from "@/lib/ops-auth";
import { log } from "@/lib/log";

/**
 * Curator queue controls — internal only, alter NO public surface.
 *  - `mute` stops a restaurant surfacing in the ops queue.
 *  - the "possible campaign" annotation is a private note.
 * Neither writes a tier, note, ranking, or any public count. Both are cookie-
 * gated: an unauthenticated caller is rejected before any write.
 */

async function upsertState(
  restaurantId: string,
  column: "muted" | "campaign_flag",
  value: boolean,
): Promise<void> {
  if (!(await isOpsAuthed())) {
    // Fail closed: no state change without a valid ops session cookie.
    log.warn("curator_queue.unauthorized_action", { column });
    return;
  }
  const sql = getSql();
  await sql.query(
    `INSERT INTO curator_queue_state (restaurant_id, ${column}, updated_at)
     VALUES ($1::uuid, $2, NOW())
     ON CONFLICT (restaurant_id)
     DO UPDATE SET ${column} = EXCLUDED.${column}, updated_at = NOW()`,
    [restaurantId, value],
  );
  revalidatePath("/ops/curator-queue");
}

export async function muteRestaurant(formData: FormData): Promise<void> {
  const restaurantId = String(formData.get("restaurant_id") ?? "").trim();
  const muted = String(formData.get("muted") ?? "true") === "true";
  if (!restaurantId) return;
  await upsertState(restaurantId, "muted", muted);
}

export async function flagCampaign(formData: FormData): Promise<void> {
  const restaurantId = String(formData.get("restaurant_id") ?? "").trim();
  const flag = String(formData.get("flag") ?? "true") === "true";
  if (!restaurantId) return;
  await upsertState(restaurantId, "campaign_flag", flag);
}
