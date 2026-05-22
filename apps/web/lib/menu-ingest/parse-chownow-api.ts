import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

type ChowNowMenuItem = {
  id?: string;
  name?: string;
  description?: string | null;
  price?: number | string | null;
  is_meta?: boolean;
};

type ChowNowMenuCategory = {
  id?: string;
  name?: string;
  menu_items?: ChowNowMenuItem[];
  items?: ChowNowMenuItem[];
};

type ChowNowMenuPayload = {
  menu_categories?: ChowNowMenuCategory[];
};

function normalizePrice(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseChowNowMenuPayload(data: unknown): ParsedMenuResult | null {
  const payload = data as ChowNowMenuPayload;
  const rawCategories = payload.menu_categories;
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) return null;

  const categories: MenuCategorySeed[] = [];

  for (const rawCategory of rawCategories) {
    const itemsRaw = rawCategory.menu_items ?? rawCategory.items ?? [];
    const items: MenuItemSeed[] = [];

    for (const rawItem of itemsRaw) {
      if (rawItem.is_meta) continue;
      const name = rawItem.name?.trim();
      if (!name) continue;
      const price = normalizePrice(rawItem.price);
      if (price <= 0) continue;
      items.push({
        name,
        description: rawItem.description?.trim() || undefined,
        price,
      });
    }

    if (items.length > 0) {
      categories.push({
        name: rawCategory.name?.trim() || "Menu",
        items,
      });
    }
  }

  const totalItems = categories.reduce((n, c) => n + c.items.length, 0);
  if (totalItems < 3) return null;

  return { categories, source: "chownow_api" };
}
