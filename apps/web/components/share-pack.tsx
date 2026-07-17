"use client";

import Link from "next/link";
import { useBeachheadCity } from "@/lib/near-me/beachhead-context";

/**
 * Ready Path A deep links — one tap to a useful filter state.
 * Lives below search; not in the hero.
 */
const PACK_MIAMI = [
  {
    href: "/?browse=1&city=miami&need=gluten_free",
    label: "Gluten / Celiac — Greater Miami",
    blurb: "Curated dedicated and protocol spots across the beachhead.",
  },
  {
    href: "/?browse=1&city=miami&need=gluten_free&neighborhood=brickell",
    label: "Gluten / Celiac — Brickell",
    blurb: "Tight radius: TAP, Stephanie’s, nearby protocol kitchens.",
  },
  {
    href: "/?browse=1&city=miami&need=nut_aware",
    label: "Nut-aware tips",
    blurb: "Peanut/tree-nut notes with named mechanisms — still verify.",
  },
  {
    href: "/?browse=1&city=miami&need=dairy_free",
    label: "Dairy-aware tips",
    blurb: "Curated dairy-aware places; ask about steamer and sauce contact.",
  },
  {
    href: "/#gf-cuban",
    label: "GF Cuban bread",
    blurb: "Dedicated bakers for Cuban-style breads — not Versailles flour.",
  },
] as const;

const PACK_JAX = [
  {
    href: "/?browse=1&city=jacksonville&need=gluten_free",
    label: "Gluten / Celiac — Jacksonville",
    blurb: "Foo Dog, Kathy’s Table, dedicated bakeries, protocol kitchens.",
  },
  {
    href: "/?browse=1&city=jacksonville&need=gluten_free&neighborhood=riverside",
    label: "Gluten / Celiac — Riverside",
    blurb: "Riverside / Avondale corridor: Foo Dog, Sweet Theory, Bartaco.",
  },
  {
    href: "/?browse=1&city=jacksonville&need=nut_aware",
    label: "Nut-aware — Jacksonville",
    blurb: "Named kitchen mechanisms only — still verify on site.",
  },
  {
    href: "/?browse=1&city=jacksonville&need=dairy_free",
    label: "Dairy-aware — Jacksonville",
    blurb: "Curated dairy-aware notes where we have a mechanism.",
  },
] as const;

export function SharePack() {
  const { cityId } = useBeachheadCity();
  const pack = cityId === "jacksonville" ? PACK_JAX : PACK_MIAMI;

  return (
    <section className="section" id="share-pack">
      <div className="section-head">
        <p className="label">share these</p>
        <h2>
          Ready links for someone who <em>needs</em> a tip
        </h2>
        <p className="lede">
          One tap opens the right filters. Paste to a friend with a dietary need —
          then ask what was useful or wrong.
        </p>
      </div>
      <div className="section-body full">
        <ul className="share-pack-list">
          {pack.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>
                <span className="share-pack-label">{item.label}</span>
                <span className="share-pack-blurb">{item.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
