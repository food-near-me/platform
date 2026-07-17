import { ImageResponse } from "next/og";
import { ShareCard, OG_SIZE, ogFonts } from "@/lib/og/share-card";

export const alt = "foodnear.me — allergy-aware dining in Miami & Jacksonville";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <ShareCard
        name="Allergy-safe dining"
        tier="Curated allergy tiers"
        meta="gluten-free · dairy-free · nut-aware"
        letter="f"
      />
    ),
    { ...size, fonts: await ogFonts() },
  );
}
