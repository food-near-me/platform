import type { Metadata } from "next";
import Link from "next/link";
import { GfCubanTip } from "@/components/gf-cuban-tip";
import { NearMeSearch } from "@/components/near-me-search";
import { SharePack } from "@/components/share-pack";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "foodnear.me — food near you",
  description:
    "Find allergy-aware places to eat in Miami — curated kitchen notes, hours when we have them, no ads.",
  openGraph: {
    title: "foodnear.me — food near you",
    description:
      "Find allergy-aware places to eat in Miami — curated kitchen notes, hours when we have them, no ads.",
    url: "https://foodnear.me",
    siteName: "foodnear.me",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "foodnear.me — food near you",
    description:
      "Find allergy-aware places to eat in Miami — curated kitchen notes, hours when we have them, no ads.",
  },
  alternates: {
    canonical: "https://foodnear.me",
  },
};

export default function Home() {
  return (
    <SiteShell variant="consumer">
      <NearMeSearch />
      <SharePack />
      <GfCubanTip />
      <section className="section">
        <div className="section-body full">
          <p className="near-me-secondary">
            Restaurant owner?{" "}
            <Link href="/for-restaurants">See the agent discovery pitch →</Link>
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
