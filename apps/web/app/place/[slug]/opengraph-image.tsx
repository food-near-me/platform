import { ImageResponse } from "next/og";
import { ShareCard, OG_SIZE, ogFonts } from "@/lib/og/share-card";
import { isDatabaseConfigured, sqlQuery } from "@/lib/db/neon";

// Static export → one alt for every place slug (curated and uncurated alike), so it
// must stay tier-neutral. A per-tier claim here would be false for OSM/unknown listings.
export const alt = "A restaurant listing on foodnear.me";
export const size = OG_SIZE;
export const contentType = "image/png";

type Row = {
  name: string;
  allergy_needs: string[] | null;
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let name = "foodnear.me";
  let meta = "Miami · Jacksonville";
  let letter = "f";

  if (isDatabaseConfigured()) {
    try {
      const rows = await sqlQuery<Row>(
        `SELECT name, allergy_needs FROM restaurants WHERE slug = $1 LIMIT 1`,
        [slug],
      );
      const r = rows[0];
      if (r) {
        name = r.name;
        letter = (r.name.trim()[0] || "f").toUpperCase();
        const needs = (r.allergy_needs ?? [])
          .slice(0, 3)
          .map((n) => n.replace(/_/g, " "))
          .join(" · ");
        meta = needs || "Miami · Jacksonville";
      }
    } catch {
      // fall through to the neutral brand card
    }
  }

  // No tier pill on the share card: it is the highest-distribution, cache-baked,
  // sentinel-unreadable surface, and an affirmative safety badge there carries no
  // scope disclaimer. Share cards stay tier-neutral (name + needs + brand).
  return new ImageResponse(<ShareCard name={name} meta={meta} letter={letter} />, {
    ...size,
    fonts: await ogFonts(),
  });
}
