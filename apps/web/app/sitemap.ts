import type { MetadataRoute } from "next";
import { isDatabaseConfigured, sqlQuery } from "@/lib/db/neon";
import { NEIGHBORHOOD_CITIES } from "@/lib/near-me/neighborhood";

const BASE = "https://foodnear.me";

/** Public, indexable routes (internal/ops/api paths are excluded). */
const STATIC_PATHS = [
  "",
  "/for-restaurants",
  "/pricing",
  "/docs",
  "/support",
  "/terms",
  "/privacy",
  "/attribution",
  "/tokenization",
  "/why-ai-gets-allergy-safety-wrong",
];

// Refresh at most hourly; place rows change slowly.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${BASE}${path || "/"}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.6,
  }));

  // Neighborhood citation-SEO pages — statically known city/hood pairs.
  const hoodEntries: MetadataRoute.Sitemap = NEIGHBORHOOD_CITIES.flatMap(
    ({ city, neighborhoods }) =>
      neighborhoods.map((h) => ({
        url: `${BASE}/near-me/${city}/${h.id}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
  );

  if (!isDatabaseConfigured()) return [...staticEntries, ...hoodEntries];

  try {
    const places = await sqlQuery<{ slug: string }>(
      `SELECT slug FROM restaurants WHERE slug IS NOT NULL ORDER BY slug LIMIT 5000`,
    );
    const placeEntries: MetadataRoute.Sitemap = places.map(({ slug }) => ({
      url: `${BASE}/place/${slug}`,
      changeFrequency: "weekly",
      priority: 0.5,
    }));
    return [...staticEntries, ...hoodEntries, ...placeEntries];
  } catch {
    // Never let a DB hiccup break the sitemap — ship the static + hood routes.
    return [...staticEntries, ...hoodEntries];
  }
}
