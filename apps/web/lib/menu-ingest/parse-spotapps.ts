import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

function dedupeItems(items: MenuItemSeed[]): MenuItemSeed[] {
  const seen = new Set<string>();
  const out: MenuItemSeed[] = [];
  for (const item of items) {
    const key = `${item.name.toLowerCase()}|${item.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** SpotApps / SpotHop restaurant sites (food-item-title + food-price). */
export function parseSpotAppsMenuHtml(html: string): ParsedMenuResult | null {
  if (!/spotapps\.co|food-item-title|food-price/i.test(html)) return null;

  const titles = [
    ...html.matchAll(/class="food-item-title"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/gi),
  ].map((m) => m[1].trim());

  const prices = [...html.matchAll(/class="food-price"[^>]*>\s*\$(\d+(?:\.\d{2})?)/gi)].map(
    (m) => Number.parseFloat(m[1]),
  );

  const descriptions = [
    ...html.matchAll(/class="food-item-description"[^>]*>([\s\S]*?)<\/div>/gi),
  ].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

  const items: MenuItemSeed[] = [];
  const count = Math.min(titles.length, prices.length);
  for (let i = 0; i < count; i++) {
    const name = titles[i];
    const price = prices[i];
    if (!name || !Number.isFinite(price) || price <= 0) continue;
    items.push({
      name,
      price,
      description: descriptions[i] || undefined,
    });
  }

  const uniqueItems = dedupeItems(items);
  if (uniqueItems.length < 3) return null;

  const sectionNames = [
    ...html.matchAll(/class="menu-section-title"[^>]*>([^<]+)</gi),
  ].map((m) => m[1].trim());

  if (sectionNames.length > 0) {
    const perSection = Math.ceil(uniqueItems.length / sectionNames.length);
    const categories: MenuCategorySeed[] = [];
    sectionNames.forEach((name, index) => {
      const slice = uniqueItems.slice(index * perSection, (index + 1) * perSection);
      if (slice.length > 0) categories.push({ name, items: slice });
    });
    return { categories, source: "spotapps_html" };
  }

  return {
    categories: [{ name: "Menu", items: uniqueItems.slice(0, 120) }],
    source: "spotapps_html",
  };
}
