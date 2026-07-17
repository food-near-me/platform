import Link from "next/link";

/**
 * Ready Path A deep links — one tap to a useful filter state.
 * Lives below search; not in the hero.
 */
const PACK = [
  {
    href: "/?browse=1&need=gluten_free",
    label: "Gluten / Celiac — Greater Miami",
    blurb: "Curated dedicated and protocol spots across the beachhead.",
  },
  {
    href: "/?browse=1&need=gluten_free&neighborhood=brickell",
    label: "Gluten / Celiac — Brickell",
    blurb: "Tight radius: TAP, Stephanie’s, nearby protocol kitchens.",
  },
  {
    href: "/?browse=1&need=nut_aware",
    label: "Nut-aware tips",
    blurb: "Peanut/tree-nut notes with named mechanisms — still verify.",
  },
  {
    href: "/?browse=1&need=dairy_free",
    label: "Dairy-aware tips",
    blurb: "Curated dairy-aware places; ask about steamer and sauce contact.",
  },
  {
    href: "/#gf-cuban",
    label: "GF Cuban bread",
    blurb: "Dedicated bakers for Cuban-style breads — not Versailles flour.",
  },
] as const;

export function SharePack() {
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
          {PACK.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>{item.label}</Link>
              <span>{item.blurb}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
