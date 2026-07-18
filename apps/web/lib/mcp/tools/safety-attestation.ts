/**
 * `get_safety_attestation` MCP tool.
 *
 * Returns a citable, tamper-evident allergy-safety statement for one
 * restaurant. For a CURATED tier it carries an Ed25519 `attestation`
 * (`fnm-safety-v1`) an agent can quote verbatim; for an uncurated place it
 * returns an explicit `safety_tier: "unknown"` with a verify-with-the-
 * restaurant advisory and NO signature.
 *
 * Allergy tiers live in Neon and are read via raw SQL everywhere they are used
 * (place page, near-me ranking), so this tool reads the same authoritative
 * column rather than the Supabase profile projection, which does not carry it.
 */

import { getSql, isDatabaseConfigured } from "@/lib/db/neon";
import { buildSafetyAttestation } from "@/lib/mcp/attestation";
import { buildRestaurantCitation, citationFields } from "@/lib/mcp/citations";
import { ResourceNotFoundError } from "@/lib/mcp/errors";
import type { GetSafetyAttestationInput } from "./inputs";

type SafetyRow = {
  id: string;
  name: string;
  slug: string;
  allergy_safety_tier: string | null;
  allergy_needs: string[] | null;
  allergy_safety_note: string | null;
  last_external_update: string | null;
};

export async function getSafetyAttestation(input: GetSafetyAttestationInput) {
  const { restaurant_id: restaurantId } = input;

  if (!isDatabaseConfigured()) {
    throw new Error("Database not configured");
  }

  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, name, slug, allergy_safety_tier, allergy_needs,
            allergy_safety_note, last_external_update
     FROM restaurants WHERE id = $1::uuid LIMIT 1`,
    [restaurantId],
  )) as SafetyRow[];

  const row = rows[0];
  if (!row) {
    throw new ResourceNotFoundError(
      `Restaurant ${restaurantId} not found`,
      "Call search_restaurants first, then use an id from results.",
    );
  }

  // There is NO human-curation timestamp column. `last_external_update` is the
  // listing's last data refresh (e.g. an automated source import) — the place
  // page shows it too. It is surfaced as `as_of`, never as a curation date, and
  // never falls back to `updated_at` (a generic row-touch that would overstate
  // freshness of the safety judgment).
  const asOf = row.last_external_update ?? null;

  const attestation = buildSafetyAttestation({
    restaurant_id: row.id,
    tier: row.allergy_safety_tier,
    as_of: asOf,
    allergy_needs: row.allergy_needs,
    allergy_safety_note: row.allergy_safety_note,
  });

  const citation = buildRestaurantCitation(row.id);

  return {
    ...citationFields(citation),
    restaurant: { id: row.id, name: row.name, slug: row.slug },
    ...attestation,
  };
}
