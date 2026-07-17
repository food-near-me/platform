import type { MetadataRoute } from "next";
import { isDatabaseConfigured, sqlQuery } from "@/lib/db/neon";

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
];

// Refresh at most hourly; place rows change slowly.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${BASE}${path || "/"}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.6,
  }));

  if (!isDatabaseConfigured()) return staticEntries;

  try {
    const places = await sqlQuery<{ slug: string }>(
      `SELECT slug FROM restaurants WHERE slug IS NOT NULL ORDER BY slug LIMIT 5000`,
    );
    const placeEntries: MetadataRoute.Sitemap = places.map(({ slug }) => ({
      url: `${BASE}/place/${slug}`,
      changeFrequency: "weekly",
      priority: 0.5,
    }));
    return [...staticEntries, ...placeEntries];
  } catch {
    // Never let a DB hiccup break the sitemap — ship the static routes.
    return staticEntries;
  }
}
