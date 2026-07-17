import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { getSql, isDatabaseConfigured } from "@/lib/db/neon";
import { evaluateOpeningHours, telHref } from "@/lib/near-me/hours";
import { formatNeedTags, tierBlurb } from "@/lib/near-me/labels";
import { inferNeighborhood } from "@/lib/near-me/neighborhood";
import { safetyTierLabel } from "@/lib/near-me/rank";

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

function trustLabel(status: string): string {
  if (status === "verified") return "verified";
  if (status === "menu_indexed") return "menu indexed";
  return "listed";
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
    `SELECT name, allergy_safety_note FROM restaurants WHERE slug = $1 LIMIT 1`,
    [slug],
  )) as { name: string; allergy_safety_note: string | null }[];
  const row = rows[0];
  const desc = row?.allergy_safety_note
    ? `${row.name} — ${row.allergy_safety_note.slice(0, 140)}`
    : row?.name
      ? `${row.name} on foodnear.me — hours, contact, and curated allergy notes when available.`
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
  const tier = place.allergy_safety_tier || "unknown";
  const hasAllergy = tier !== "unknown" && Boolean(place.allergy_safety_note);
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
         AND allergy_safety_tier <> 'unknown'
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

  return (
    <SiteShell variant="consumer">
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

            {place.address ? (
              <p className="near-me-address">{place.address}</p>
            ) : (
              <p className="near-me-address mute">Address not listed yet</p>
            )}

            {hasAllergy ? (
              <div className={`place-allergy place-allergy-${tier}`}>
                <h2 className="place-allergy-title">Allergy / dietary note</h2>
                <p className="near-me-safety">{safetyTierLabel(tier)}</p>
                <p className="place-allergy-blurb">{tierBlurb(tier)}</p>
                <p className="place-allergy-note">{place.allergy_safety_note}</p>
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
                        {r.distance_miles} mi · {safetyTierLabel(r.allergy_safety_tier)}
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
