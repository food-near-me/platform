import { createNeonDbClient, type NeonDbClient } from "@/lib/db/compat";
import { isDatabaseConfigured } from "@/lib/db/neon";

/** Server-side DB client (Neon). Name kept for call-site compatibility. */
export function getSupabaseAdminClient(): NeonDbClient {
  if (!isDatabaseConfigured()) {
    throw new Error("Missing DATABASE_URL (Neon connection string)");
  }
  return createNeonDbClient();
}
