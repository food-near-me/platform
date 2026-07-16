import Link from "next/link";

/**
 * Miami-specific tip: traditional Cuban bread is wheat — point to dedicated GF bakers.
 * One section, one job. Lives below the near-me search, not in the hero.
 */
export function GfCubanTip() {
  return (
    <section className="section" id="gf-cuban">
      <div className="section-head">
        <p className="label">miami tip</p>
        <h2>
          Looking for <em>gluten-free Cuban bread</em>?
        </h2>
        <p className="lede">
          Classic Cuban bakeries use wheat flour. For a dedicated gluten-free
          kitchen — including Cuban-style breads and pastries — start here. Always
          confirm day-of.
        </p>
      </div>
      <div className="section-body full">
        <ul className="gf-cuban-list">
          <li>
            <Link href="/place/doras-bakery-coral-gables-allergy">
              Dora&apos;s Bakery &amp; Bistro
            </Link>
            <span> — dedicated GF bakery in Coral Gables; local answer for Cuban-style breads.</span>
          </li>
          <li>
            <Link href="/place/almotti-kendall-allergy">Almotti</Link>
            <span>
              {" "}
              — dedicated GF Italian bakery in Kendall; breads and pastries without a shared
              wheat kitchen.
            </span>
          </li>
        </ul>
        <p className="gf-cuban-note">
          Iconic spots like Versailles are shared kitchens with flour everywhere — fine for
          context, not a celiac-safe Cuban bread source.
        </p>
      </div>
    </section>
  );
}
