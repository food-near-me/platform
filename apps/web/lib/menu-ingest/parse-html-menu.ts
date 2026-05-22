import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

function parsePriceFromText(text: string): number | null {
  const match = text.match(/\$\s*(\d+(?:\.\d{2})?)/);
  if (!match) return null;
  const price = Number.parseFloat(match[1]);
  return Number.isFinite(price) && price > 0 ? price : null;
}

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

/**
 * Squarespace "menu block" HTML — common on independent NYC restaurant sites.
 */
export function parseSquarespaceMenuHtml(html: string): ParsedMenuResult | null {
  if (!html.includes("menu-item-title")) return null;

  const categories: MenuCategorySeed[] = [];
  let currentCategory = "Menu";

  const sectionPattern =
    /<div class="menu-section-title"[^>]*>([\s\S]*?)<\/div>/gi;
  const itemPattern =
    /<div class="menu-item-title"[^>]*>([^<]+)<\/div>[\s\S]{0,400}?(?:menu-item-price-top|menu-item-price-bottom)[^>]*>[\s\S]*?currency-sign">\$<\/span>\s*([\d.]+)/gi;

  const sections = [...html.matchAll(sectionPattern)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );

  const items: MenuItemSeed[] = [];
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(html)) !== null) {
    const name = match[1].replace(/&amp;/g, "&").trim();
    const price = Number.parseFloat(match[2]);
    if (!name || name === "+ ADD" || !Number.isFinite(price) || price <= 0) continue;

    items.push({
      name,
      price,
      dietary_vegan: /\(v\)|\bvegan\b/i.test(name),
      dietary_vegetarian: /\(v\)|vegetarian|vegan/i.test(name),
    });
  }

  const uniqueItems = dedupeItems(items);
  if (uniqueItems.length < 3) return null;

  if (sections.length > 0) {
    const perSection = Math.ceil(uniqueItems.length / sections.length);
    sections.forEach((sectionName, index) => {
      const slice = uniqueItems.slice(index * perSection, (index + 1) * perSection);
      if (slice.length > 0) {
        categories.push({ name: sectionName.slice(0, 80) || currentCategory, items: slice });
      }
    });
  }

  if (categories.length === 0) {
    categories.push({ name: currentCategory, items: uniqueItems });
  }

  return { categories, source: "squarespace_html" };
}

/**
 * Fallback: "Dish Name ... $12.00" lines and microdata-ish blocks in HTML.
 */
export function parseHeuristicMenuHtml(html: string): ParsedMenuResult | null {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const items: MenuItemSeed[] = [];

  const linePattern =
    /(?:>|^|\n)\s*([A-Z][A-Za-z0-9'&./\-–— ]{2,60}?)\s*(?:\.{2,}|[-–—]\s*)\s*\$(\d+(?:\.\d{2})?)/g;
  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(stripped)) !== null) {
    const name = match[1].trim();
    const price = Number.parseFloat(match[2]);
    if (name.length < 3 || price <= 0 || price > 500) continue;
    if (/^(Menu|Order|Contact|Hours|Home|About)$/i.test(name)) continue;
    items.push({ name, price });
  }

  const optionPattern = /class="menu-item-option"[^>]*>([^<]+\$\d+(?:\.\d{2})?)/gi;
  while ((match = optionPattern.exec(html)) !== null) {
    const text = match[1].trim();
    const price = parsePriceFromText(text);
    const name = text.replace(/\$\s*\d+(?:\.\d{2})?.*$/, "").trim();
    if (name && price) items.push({ name, price });
  }

  const uniqueItems = dedupeItems(items);
  if (uniqueItems.length < 3) return null;

  return {
    categories: [{ name: "Menu", items: uniqueItems.slice(0, 80) }],
    source: "html_heuristic",
  };
}

export function parseMicrodataMenuHtml(html: string): ParsedMenuResult | null {
  if (!/itemtype=["'][^"']*MenuItem/i.test(html)) return null;

  const items: MenuItemSeed[] = [];
  const blocks = html.split(/itemtype=["'][^"']*MenuItem["']/i).slice(1);

  for (const block of blocks.slice(0, 100)) {
    const name =
      block.match(/itemprop=["']name["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
      block.match(/itemprop=["']name["'][^>]*>([^<]+)</i)?.[1];
    const priceText =
      block.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
      block.match(/itemprop=["']price["'][^>]*>([^<]+)</i)?.[1];

    if (!name?.trim()) continue;
    const price = priceText ? parsePriceFromText(`$${priceText}`) : null;
    if (!price) continue;

    items.push({ name: name.trim(), price });
  }

  const uniqueItems = dedupeItems(items);
  if (uniqueItems.length < 2) return null;

  return {
    categories: [{ name: "Menu", items: uniqueItems }],
    source: "microdata",
  };
}
