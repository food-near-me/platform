import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

type SauceItem = {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
};

type SauceSection = {
  id: string;
  name: string;
  itemIds?: string[];
};

type SauceMenuDetails = {
  sections?: SauceSection[];
  items?: SauceItem[];
};

function parseNextData(html: string): unknown | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function normalizeSaucePrice(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return value;
}

export function parseSauceMenuHtml(html: string): ParsedMenuResult | null {
  if (!/getsauce\.com/i.test(html) && !html.includes("__NEXT_DATA__")) return null;

  const data = parseNextData(html) as {
    props?: { pageProps?: { menuDetails?: SauceMenuDetails } };
  } | null;

  const menuDetails = data?.props?.pageProps?.menuDetails;
  if (!menuDetails?.sections?.length || !menuDetails.items?.length) return null;

  const itemMap = new Map(menuDetails.items.map((item) => [item.id, item]));
  const categories: MenuCategorySeed[] = [];

  for (const section of menuDetails.sections) {
    const items: MenuItemSeed[] = [];
    for (const itemId of section.itemIds ?? []) {
      const item = itemMap.get(itemId);
      if (!item?.name?.trim()) continue;
      const price = normalizeSaucePrice(item.price);
      if (price <= 0) continue;
      items.push({
        name: item.name.trim(),
        description: item.description?.trim() || undefined,
        price,
      });
    }
    if (items.length > 0) {
      categories.push({ name: section.name?.trim() || "Menu", items });
    }
  }

  const totalItems = categories.reduce((n, c) => n + c.items.length, 0);
  if (totalItems < 3) return null;

  return { categories, source: "sauce_next_data" };
}
