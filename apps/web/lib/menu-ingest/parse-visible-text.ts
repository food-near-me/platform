import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

const SKIP_LINE =
  /^(skip to|home|contact|hours|about|menu|order|reserve|location|phone|email|top$|copyright)/i;
const CATEGORY_LINE =
  /^(appetizers|entrees|mains|desserts|drinks|cocktails|wine|beer|brunch|lunch|dinner|sides|salads|soups|specials|pizza|pasta|tacos|sushi|rolls|whisk|cocktail|spirit|beer|wine|food|beverages)/i;

function parsePrice(line: string): { name: string; price: number } | null {
  const patterns = [
    /^(.+?)\s+[\$€]\s*(\d+(?:\.\d{2})?)\s*$/,
    /^(.+?)\s+(\d+(?:\.\d{2})?)\s*$/,
    /^(.+?)\s*[-–—]\s*[\$€]?\s*(\d+(?:\.\d{2})?)\s*$/,
    /[\$€]\s*(\d+(?:\.\d{2})?)\s*[-–—]\s*(.+)$/,
  ];

  for (const pattern of patterns) {
    const m = line.match(pattern);
    if (!m) continue;
    const name = (pattern.source.startsWith("[\\$") ? m[2] : m[1]).trim();
    const price = Number.parseFloat(m[pattern.source.startsWith("[\\$") ? 1 : 2]);
    if (name.length >= 3 && name.length <= 80 && price > 0 && price < 500) {
      return { name, price };
    }
  }
  return null;
}

/**
 * Parse menu lines from visible page text (Playwright innerText).
 * Last resort for Wix / JS menus with no structured HTML.
 */
export function parseVisibleTextMenu(text: string): ParsedMenuResult | null {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 2 && l.length < 120);

  const categories: MenuCategorySeed[] = [];
  let current: MenuCategorySeed = { name: "Menu", items: [] };

  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue;
    if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(line)) continue;
    if (/\d{3,}.*(am|pm|street|ave|blvd|brooklyn|ny)\b/i.test(line)) continue;

    const item = parsePrice(line);
    if (item) {
      current.items.push({ name: item.name, price: item.price });
      continue;
    }

    if (
      CATEGORY_LINE.test(line) ||
      (line === line.toUpperCase() && line.length < 40 && !/\d/.test(line))
    ) {
      if (current.items.length > 0) categories.push(current);
      current = { name: line.slice(0, 60), items: [] };
    }
  }

  if (current.items.length > 0) categories.push(current);

  const total = categories.reduce((n, c) => n + c.items.length, 0);
  if (total < 5) return null;

  return { categories, source: "visible_text" };
}
