import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

/** Lightweight heuristics for ChowNow / Popmenu / Olo embed pages. */
export function parseGenericPlatformMenuHtml(
  html: string,
  platform: "chownow" | "popmenu" | "olo",
): ParsedMenuResult | null {
  const hostPattern =
    platform === "chownow"
      ? /chownow\.com/i
      : platform === "popmenu"
        ? /popmenu\.com/i
        : /olo\.com/i;

  if (!hostPattern.test(html)) return null;

  const items: MenuItemSeed[] = [];

  for (const match of html.matchAll(
    /"(?:name|itemName|productName)"\s*:\s*"([^"]{2,80})"[\s\S]{0,200}?"(?:price|basePrice|amount)"\s*:\s*(\d+(?:\.\d{1,2})?)/gi,
  )) {
    const name = match[1].trim();
    const price = Number.parseFloat(match[2]);
    if (name && Number.isFinite(price) && price > 0) {
      items.push({ name, price: price > 1000 ? price / 100 : price });
    }
  }

  if (items.length < 3) return null;

  const categories: MenuCategorySeed[] = [{ name: "Menu", items: items.slice(0, 100) }];
  return { categories, source: `${platform}_json` as ParsedMenuResult["source"] };
}
