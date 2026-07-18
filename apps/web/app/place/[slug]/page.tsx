import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { FreshnessControl } from "@/components/freshness-control";
import { getSql, isDatabaseConfigured } from "@/lib/db/neon";
import { evaluateOpeningHours, telHref } from "@/lib/near-me/hours";
import { formatNeedTags, tierBlurb, trustLabel } from "@/lib/near-me/labels";
import { formatLastCheckedDate } from "@/lib/near-me/format-date";
import { inferNeighborhood } from "@/lib/near-me/neighborhood";
import { curatedTierLabel, safetyTierLabel } from "@/lib/near-me/rank";
import { buildSafetyDisclosure } from "@/lib/mcp/attestation";

type PlaceRow = {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  website_url: string | null;
  phone: string | null;
  opening_hours: string | null;
  cuisine_type: string[] | null;
  verification_status: string;
  allergy_needs: string[] | null;
  allergy_safety_tier: string | null;
  allergy_safety_note: string | null;
  last_external_update: string | null;
  lat: number | null;
  lng: number | null;
};

type RelatedRow = {
  name: string;
  slug: string;
  allergy_safety_tier: string;
  distance_miles: number;
};

function mapsUrl(name: string, address?: string | null) {
  const q = encodeURIComponent([name, address].filter(Boolean).join(", "));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isDatabaseConfigured()) {
    return { title: "Place — foodnear.me" };
  }
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, name, allergy_safety_tier, allergy_safety_note
     FROM restaurants WHERE slug = $1 LIMIT 1`,
    [slug],
  )) as {
    id: string;
    name: string;
    allergy_safety_tier: string | null;
    allergy_safety_note: string | null;
  }[];
  const row = rows[0];
  // Route the note through the honesty gate: a social/meta description may quote
  // a vetting note ONLY for a curated tier. An uncurated place's scraped note is
  // dropped here just as it is on the visible page — never leaked into the preview.
  const metaNote = row
    ? buildSafetyDisclosure({
        restaurant_id: row.id,
        tier: row.allergy_safety_tier,
        allergy_safety_note: row.allergy_safety_note,
      }).allergy_safety_note ?? null
    : null;
  // Prefer a COMPLETE first sentence so a social preview never cuts a safety
  // claim mid-assertion (e.g. dropping "shared kitchen — verify"). Same
  // sentence split used by buildWhy().
  const noteBlurb = (note: string): string => {
    const first = note.trim().split(/(?<=\.)\s+/)[0] ?? note.trim();
    if (first.length <= 140) return first;
    // Cut at the last word boundary within the limit — never mid-word.
    const cut = first.slice(0, 140);
    const atWord = cut.slice(0, cut.lastIndexOf(" "));
    return `${(atWord || cut).trimEnd()}…`;
  };
  const desc = metaNote
    ? `${row.name} — ${noteBlurb(metaNote)}`
    : row?.name
      ? `${row.name} on foodnear.me — hours, contact, and menu details.`
      : "Restaurant place page";
  return {
    title: row?.name ? `${row.name} — foodnear.me` : "Place — foodnear.me",
    description: desc,
  };
}

export default async function PlacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isDatabaseConfigured()) notFound();
  const { slug } = await params;
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT id, name, slug, address, website_url, phone, opening_hours,
            cuisine_type, verification_status,
            allergy_needs, allergy_safety_tier, allergy_safety_note,
            last_external_update,
            ST_Y(location::geometry) AS lat,
            ST_X(location::geometry) AS lng
     FROM restaurants WHERE slug = $1 LIMIT 1`,
    [slug],
  )) as PlaceRow[];
  const place = rows[0];
  if (!place) notFound();

  const hours = evaluateOpeningHours(place.opening_hours, {
    timeZone: "America/New_York",
  });
  const phoneUrl = telHref(place.phone);
  // Route the tier through the same honesty gate as the agent/MCP surface: an
  // uncurated place collapses to "unknown" with no note, so a scraped note can
  // never render as if it were a vetting finding. `tier` here is whitelist-safe.
  const disclosure = buildSafetyDisclosure({
    restaurant_id: place.id,
    tier: place.allergy_safety_tier,
    allergy_needs: place.allergy_needs,
    allergy_safety_note: place.allergy_safety_note,
  });
  const tier = disclosure.safety_tier;
  const vettingNote = disclosure.allergy_safety_note ?? null;
  const neighborhood = inferNeighborhood({
    address: place.address,
    lat: place.lat,
    lng: place.lng,
  });
  const needTags = formatNeedTags(place.allergy_needs);
  const primaryNeed = place.allergy_needs?.[0] ?? null;

  let related: RelatedRow[] = [];
  if (place.lat != null && place.lng != null && place.allergy_needs?.length) {
    related = (await sql.query(
      `SELECT name, slug, allergy_safety_tier,
              round((ST_Distance(
                location,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
              ) / 1609.344)::numeric, 1) AS distance_miles
       FROM restaurants
       WHERE id <> $3::uuid
         -- Curated whitelist, NOT a denylist: a typo'd or fooled hand-edit tier
         -- must never slip onto this affirmative curated-nearby surface. Only real
         -- curated tiers qualify.
         AND allergy_safety_tier IN ('dedicated', 'strong_protocol', 'shared_verify')
         AND allergy_needs && $4::text[]
         AND ST_DWithin(
           location,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           16093
         )
       ORDER BY
         CASE allergy_safety_tier
           WHEN 'dedicated' THEN 0
           WHEN 'strong_protocol' THEN 1
           WHEN 'shared_verify' THEN 2
           ELSE 3
         END,
         location <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
       LIMIT 4`,
      [place.lat, place.lng, place.id, place.allergy_needs],
    )) as RelatedRow[];
  }

  const searchHref = primaryNeed ? `/?need=${encodeURIComponent(primaryNeed)}` : "/";

  // Restaurant structured data — factual business fields only. Scraped allergy
  // tokens are intentionally excluded from servesCuisine: a machine-readable
  // safety claim would overstate the curated, verify-with-the-restaurant nature
  // of our notes. Curated tier/needs ARE emitted, but only via the CURATED_TIERS
  // whitelist below (never for an uncurated "unknown" listing).
  const allergyTokens = new Set([
    "gluten_free",
    "dairy_free",
    "nut_aware",
    "vegetarian",
    "vegan",
  ]);
  const structuredCuisines = (place.cuisine_type ?? []).filter(
    (c) => !allergyTokens.has(c),
  );
  // A machine-readable tier is honest ONLY for a curated listing. The disclosure
  // gate (shared with the agent/MCP surface) already resolved this so an "unknown"
  // tier emits nothing tier-related — never a fabricated safety claim for an
  // uncurated spot.
  const isCurated = disclosure.curated;
  // Freshness marker: last_external_update is bumped by automated external-source
  // refreshes (OSM/import), so the copy says "last updated", not "last checked" —
  // it never implies a human re-verified the listing or its allergy tier.
  const lastUpdated = formatLastCheckedDate(place.last_external_update);
  const placeJsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `https://foodnear.me/place/${place.slug}#restaurant`,
    name: place.name,
    url: `https://foodnear.me/place/${place.slug}`,
    ...(place.website_url ? { sameAs: [place.website_url] } : {}),
    ...(place.phone ? { telephone: place.phone } : {}),
    ...(structuredCuisines.length ? { servesCuisine: structuredCuisines } : {}),
    ...(place.address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: place.address,
            addressRegion: "FL",
            addressCountry: "US",
          },
        }
      : {}),
    ...(place.lat != null && place.lng != null
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: place.lat,
            longitude: place.lng,
          },
        }
      : {}),
    ...(place.opening_hours ? { openingHours: place.opening_hours } : {}),
    ...(isCurated
      ? {
          additionalProperty: [
            {
              "@type": "PropertyValue",
              name: "allergySafetyTier",
              value: tier,
              description: safetyTierLabel(tier),
            },
            ...(place.allergy_needs?.length
              ? [
                  {
                    "@type": "PropertyValue",
                    name: "allergyNeeds",
                    value: place.allergy_needs.join(", "),
                    description:
                      "Curated allergen/dietary needs this restaurant addresses",
                  },
                ]
              : []),
          ],
        }
      : {}),
  };

  return (
    <SiteShell variant="consumer">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(placeJsonLd) }}
      />
      <section className="section">
        <div className="section-head">
          <p className="label">
            <Link href={searchHref}>← Back to search</Link>
          </p>
          {neighborhood && <p className="place-hood">{neighborhood}</p>}
          <h1 className="near-me-title">{place.name}</h1>
          <p className="lede">
            <span className="near-me-tier">{trustLabel(place.verification_status)}</span>
            {place.cuisine_type?.length
              ? ` · ${place.cuisine_type.slice(0, 4).join(", ")}`
              : ""}
          </p>
        </div>

        <div className="section-body full">
          <div className="near-me-panel place-panel">
            <p
              className={`near-me-hours ${
                hours.open_now === true
                  ? "is-open"
                  : hours.open_now === false
                    ? "is-closed"
                    : "is-unknown"
              }`}
            >
              {hours.hours_label}
            </p>
            {place.opening_hours ? (
              <p className="place-hours-raw">Listed hours: {place.opening_hours}</p>
            ) : null}
            {lastUpdated ? (
              <p className="place-freshness">
                Contact details last updated: {lastUpdated}
              </p>
            ) : null}

            {place.address ? (
              <p className="near-me-address">{place.address}</p>
            ) : (
              <p className="near-me-address mute">Address not listed yet</p>
            )}

            {disclosure.curated ? (
              <div className={`place-allergy place-allergy-${tier}`}>
                <h2 className="place-allergy-title">Why this rating</h2>
                <p className="near-me-safety">{safetyTierLabel(tier)}</p>
                <p className="place-allergy-blurb">{tierBlurb(tier)}</p>
                {vettingNote && (
                  <div className="place-why-note">
                    <p className="place-why-label">What we found at this location</p>
                    <p className="place-allergy-note">{vettingNote}</p>
                  </div>
                )}
                {needTags.length > 0 && (
                  <ul className="place-need-chips">
                    {needTags.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="place-allergy place-allergy-empty">
                <h2 className="place-allergy-title">Allergy / dietary note</h2>
                <p>
                  No curated allergy info for this listing. Ask the restaurant directly
                  about your need — do not assume safety from the menu alone.
                </p>
              </div>
            )}

            <div className="place-verify">
              <h2 className="place-verify-title">Before you go</h2>
              <ol className="place-verify-list">
                <li>Call ahead and name your specific allergy or need.</li>
                <li>
                  Ask how they handle cross-contact (shared fryers, sauces, prep surfaces).
                </li>
                <li>Confirm this location is open and the hours still match.</li>
                {tier === "dedicated" || place.allergy_needs?.includes("gluten_free") ? (
                  <li>
                    For celiac, cross-check{" "}
                    <a
                      href="https://www.findmeglutenfree.com/us/fl/miami"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Find Me Gluten Free
                    </a>{" "}
                    — curated notes are not a medical guarantee.
                  </li>
                ) : (
                  <li>
                    Protocols drift. Re-verify day-of even if a past visit went fine.
                  </li>
                )}
              </ol>
              <div className="near-me-actions">
                {phoneUrl ? (
                  <a className="btn" href={phoneUrl}>
                    Call to verify
                  </a>
                ) : (
                  <a
                    className="btn"
                    href={mapsUrl(place.name, place.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Maps
                  </a>
                )}
                {phoneUrl && (
                  <a
                    className="btn btn-ghost"
                    href={mapsUrl(place.name, place.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Maps
                  </a>
                )}
                {place.website_url && (
                  <a
                    className="btn btn-ghost"
                    href={place.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Website
                  </a>
                )}
              </div>
            </div>

            {/* Freshness signal — physically separated from the "Why this rating"
                tier block. A tap moves a curator's attention only; it changes no
                tier, note, or count on this page. */}
            <FreshnessControl restaurantId={place.id} />

            {related.length > 0 && (
              <div className="place-related">
                <h2 className="place-related-title">Also curated nearby</h2>
                <ul className="place-related-list">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link href={`/place/${encodeURIComponent(r.slug)}`}>
                        {r.name}
                      </Link>
                      <span>
                        {r.distance_miles} mi · {curatedTierLabel(r.allergy_safety_tier)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="near-me-footnote">
              Curated notes describe kitchen mechanism, not a medical guarantee. Always
              verify with the restaurant before dining.
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
