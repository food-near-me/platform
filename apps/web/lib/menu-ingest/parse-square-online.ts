import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

type JsonObject = Record<string, unknown>;

function parseNextData(html: string): JsonObject | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as JsonObject;
  } catch {
    return null;
  }
}

function walk(value: unknown, items: MenuItemSeed[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => walk(entry, items));
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value as JsonObject;

  const name =
    (typeof obj.name === "string" && obj.name) ||
    (typeof obj.title === "string" && obj.title) ||
    "";
  const priceRaw =
    obj.price ??
    obj.priceMoney ??
    (obj as { price_money?: { amount?: number } }).price_money?.amount;
  let price = 0;
  if (typeof priceRaw === "number") {
    price = priceRaw > 1000 ? priceRaw / 100 : priceRaw;
  }

  if (name.trim() && price > 0) {
    items.push({
      name: name.trim(),
      description:
        typeof obj.description === "string" ? obj.description.trim() : undefined,
      price,
    });
  }

  for (const child of Object.values(obj)) walk(child, items);
}

/** Square Online storefront pages (`square.site`, `squareup.com/s/`). */
export function parseSquareOnlineMenuHtml(html: string): ParsedMenuResult | null {
  if (!/square\.site|squareup\.com/i.test(html)) return null;

  const items: MenuItemSeed[] = [];
  const nextData = parseNextData(html);
  if (nextData) walk(nextData, items);

  const deduped = items.filter(
    (item, index, arr) =>
      arr.findIndex((x) => x.name === item.name && x.price === item.price) === index,
  );

  if (deduped.length < 3) return null;

  return {
    categories: [{ name: "Menu", items: deduped.slice(0, 120) }],
    source: "square_online_json",
  };
}
