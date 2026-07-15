import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site-shell";
import { getSql, isDatabaseConfigured } from "@/lib/db/neon";
import { evaluateOpeningHours, telHref } from "@/lib/near-me/hours";
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
  const rows = (await sql.query(`SELECT name FROM restaurants WHERE slug = $1 LIMIT 1`, [
    slug,
  ])) as { name: string }[];
  const name = rows[0]?.name;
  return {
    title: name ? `${name} — foodnear.me` : "Place — foodnear.me",
    description: name
      ? `${name} on foodnear.me — hours, contact, and curated allergy notes when available.`
      : "Restaurant place page",
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
            allergy_needs, allergy_safety_tier, allergy_safety_note
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

  return (
    <SiteShell variant="consumer">
      <section className="section">
        <div className="section-head">
          <p className="label">
            <Link href="/">← Back to search</Link>
          </p>
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

            {place.address ? (
              <p className="near-me-address">{place.address}</p>
            ) : (
              <p className="near-me-address mute">Address not listed yet</p>
            )}

            {hasAllergy ? (
              <div className="place-allergy">
                <h2 className="place-allergy-title">Allergy / dietary note</h2>
                <p className="near-me-safety">{safetyTierLabel(tier)}</p>
                <p className="place-allergy-note">{place.allergy_safety_note}</p>
                {place.allergy_needs?.length ? (
                  <p className="place-allergy-needs">
                    Tagged for: {place.allergy_needs.join(", ")}
                  </p>
                ) : null}
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

            <div className="near-me-actions">
              <a
                className="btn"
                href={mapsUrl(place.name, place.address)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in Maps
              </a>
              {phoneUrl && (
                <a className="btn btn-ghost" href={phoneUrl}>
                  Call
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

            <p className="near-me-footnote">
              Curated notes describe kitchen mechanism, not a medical guarantee. Always
              verify with the restaurant before dining. For celiac, cross-check Find Me
              Gluten Free.
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
