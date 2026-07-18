import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { getSql, isDatabaseConfigured } from "@/lib/db/neon";
import { getBeachhead } from "@/lib/near-me/beachheads";
import { formatNeedTags, tierBlurb } from "@/lib/near-me/labels";
import {
  FILTER_NEIGHBORHOODS_JAX,
  FILTER_NEIGHBORHOODS_MIAMI,
  NEIGHBORHOOD_CITIES,
  type FilterNeighborhood,
} from "@/lib/near-me/neighborhood";
import {
  buildNeighborhoodListing,
  type NeighborhoodRow,
} from "@/lib/near-me/neighborhood-listing";
import { safetyTierLabel } from "@/lib/near-me/rank";
import { buildSafetyDisclosure } from "@/lib/mcp/attestation";

// ISR: prerender for SEO/citation speed, but refresh hourly so re-seeded
// curation surfaces without a redeploy (matches the sitemap's cadence).
export const revalidate = 3600;

const CITIES: Record<string, FilterNeighborhood[]> = {
  miami: FILTER_NEIGHBORHOODS_MIAMI,
  jacksonville: FILTER_NEIGHBORHOODS_JAX,
};

function findHood(city: string, neighborhood: string): FilterNeighborhood | null {
  return CITIES[city]?.find((h) => h.id === neighborhood) ?? null;
}

export function generateStaticParams(): { city: string; neighborhood: string }[] {
  return NEIGHBORHOOD_CITIES.flatMap(({ city, neighborhoods }) =>
    neighborhoods.map((h) => ({ city, neighborhood: h.id })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; neighborhood: string }>;
}): Promise<Metadata> {
  const { city, neighborhood } = await params;
  const hood = findHood(city, neighborhood);
  if (!hood) return { title: "Neighborhood — foodnear.me" };
  const cityLabel = getBeachhead(city).shortLabel;
  const canonical = `https://foodnear.me/near-me/${city}/${neighborhood}`;
  return {
    title: `Allergy-safe restaurants in ${hood.name}, ${cityLabel} — foodnear.me`,
    description: `Human-curated allergy-safe restaurants in ${hood.name}, ${cityLabel}. Curated notes describe kitchen mechanism, not a medical guarantee — always verify with the restaurant.`,
    alternates: { canonical },
    openGraph: {
      title: `Allergy-safe restaurants in ${hood.name}, ${cityLabel}`,
      description: `Human-curated allergy-safe spots in ${hood.name}. Verify with the restaurant before you go.`,
      url: canonical,
    },
  };
}

export default async function NeighborhoodPage({
  params,
}: {
  params: Promise<{ city: string; neighborhood: string }>;
}) {
  const { city, neighborhood } = await params;
  const hood = findHood(city, neighborhood);
  if (!hood || !isDatabaseConfigured()) notFound();

  const cityLabel = getBeachhead(city).shortLabel;
  const sql = getSql();
  const radiusMeters = hood.radiusMiles * 1609.34;

  // Pull every place in the hood radius, curated tiers first, then nearest. The
  // JS split (buildNeighborhoodListing) is the honesty gate: only curated tiers
  // reach the safe-spot list/headline; uncurated rows stay tier-neutral.
  const rows = (await sql.query(
    `SELECT id, name, slug, address,
            allergy_needs, allergy_safety_tier, allergy_safety_note,
            round((ST_Distance(
              location,
              ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
            ) / 1609.344)::numeric, 1) AS distance_miles
     FROM restaurants
     WHERE ST_DWithin(
       location,
       ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
       $3
     )
     ORDER BY
       CASE allergy_safety_tier
         WHEN 'dedicated' THEN 0
         WHEN 'strong_protocol' THEN 1
         WHEN 'shared_verify' THEN 2
         ELSE 3
       END,
       location <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
     LIMIT 80`,
    [hood.lat, hood.lng, radiusMeters],
  )) as NeighborhoodRow[];

  const { curated, other, curatedCount } = buildNeighborhoodListing(rows);

  // JSON-LD stays factual: an ItemList of the curated restaurants by name + URL.
  // No machine-readable allergy tier is emitted for the list — same restraint as
  // the place page keeps for uncurated rows; a hood page never asserts safety in
  // structured data.
  const itemListJsonLd = curatedCount
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        // No machine-readable item-count field here: a public COUNT of safety-graded
        // places is an aggregate the honesty invariant forbids. The named items below
        // are factual (each links to its own gated page); the human headline stays.
        name: `Curated allergy-safe restaurants in ${hood.name}, ${cityLabel}`,
        itemListElement: curated.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `https://foodnear.me/place/${r.slug}`,
          name: r.name,
        })),
      }
    : null;

  return (
    <SiteShell variant="consumer">
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      <section className="section">
        <div className="section-head">
          <p className="label">
            <Link href="/">← Back to search</Link>
          </p>
          <h1 className="near-me-title">
            Allergy-safe restaurants in {hood.name}
          </h1>
          <p className="lede">
            {curatedCount > 0
              ? `${curatedCount} human-curated allergy-safe ${
                  curatedCount === 1 ? "spot" : "spots"
                } in ${hood.name}, ${cityLabel}.`
              : `No curated allergy-safe spots in ${hood.name} yet. Uncurated nearby places are listed below — verify every dietary need directly.`}
          </p>
        </div>

        <div className="section-body full">
          <div className="near-me-panel">
            {curatedCount > 0 && (
              <div className="hood-curated">
                <h2 className="hood-section-title">
                  Human-curated allergy-safe spots
                </h2>
                <ul className="hood-list">
                  {curated.map((r) => {
                    const tier = r.allergy_safety_tier ?? "unknown";
                    const needs = formatNeedTags(r.allergy_needs);
                    // Route the note through the SAME honesty gate as every other
                    // surface — never render a raw DB note. The gate drops the note
                    // for any non-curated tier, so this citable "why" line can only
                    // ever carry a curated vetting note. First sentence of that
                    // note, else the generic tier blurb.
                    const gatedNote = buildSafetyDisclosure({
                      restaurant_id: r.id,
                      tier: r.allergy_safety_tier,
                      allergy_safety_note: r.allergy_safety_note,
                    }).allergy_safety_note;
                    const whyLine =
                      gatedNote?.trim().split(/(?<=\.)\s+/)[0] || tierBlurb(tier);
                    return (
                      <li key={r.slug} className={`hood-item hood-item-${tier}`}>
                        <Link href={`/place/${encodeURIComponent(r.slug)}`}>
                          {r.name}
                        </Link>
                        <p className="hood-item-tier">{safetyTierLabel(tier)}</p>
                        <p className="hood-item-blurb">{whyLine}</p>
                        {needs.length > 0 && (
                          <ul className="place-need-chips">
                            {needs.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        )}
                        <span className="hood-item-dist">{r.distance_miles} mi</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {other.length > 0 && (
              <div className="hood-other">
                <h2 className="hood-section-title">
                  Other spots in the area — not vetted
                </h2>
                <p className="hood-other-note">
                  We have not curated an allergy note for these. Ask the restaurant
                  directly — do not assume safety from the menu alone.
                </p>
                <ul className="hood-list hood-list-neutral">
                  {other.map((r) => (
                    <li key={r.slug} className="hood-item hood-item-neutral">
                      <Link href={`/place/${encodeURIComponent(r.slug)}`}>
                        {r.name}
                      </Link>
                      <span className="hood-item-dist">{r.distance_miles} mi</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="near-me-footnote">
              How we tier — and{" "}
              <Link href="/why-ai-gets-allergy-safety-wrong">
                why AI often gets restaurant allergy safety wrong
              </Link>
              . Curated notes describe kitchen mechanism, not a medical guarantee.
              Always verify with the restaurant before dining.
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
