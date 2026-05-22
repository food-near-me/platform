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

function walkForMenuNodes(value: unknown, bucket: JsonObject[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => walkForMenuNodes(entry, bucket));
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value as JsonObject;
  const keys = Object.keys(obj).join(" ").toLowerCase();
  if (
    keys.includes("menuitem") ||
    keys.includes("menuitems") ||
    keys.includes("menugroups") ||
    (typeof obj.name === "string" && (obj.price !== undefined || obj.basePrice !== undefined))
  ) {
    bucket.push(obj);
  }
  for (const child of Object.values(obj)) {
    walkForMenuNodes(child, bucket);
  }
}

function collectToastItems(node: JsonObject, items: MenuItemSeed[]): void {
  if (Array.isArray(node.menuItems)) {
    for (const raw of node.menuItems) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as JsonObject;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const priceRaw = item.price ?? item.basePrice ?? item.unitPrice;
      const price =
        typeof priceRaw === "number"
          ? priceRaw
          : typeof priceRaw === "string"
            ? Number.parseFloat(priceRaw)
            : NaN;
      if (name && Number.isFinite(price) && price > 0) {
        items.push({
          name,
          description:
            typeof item.description === "string" ? item.description.trim() : undefined,
          price: price > 1000 ? price / 100 : price,
        });
      }
    }
  }

  if (Array.isArray(node.menuGroups)) {
    for (const group of node.menuGroups) {
      if (group && typeof group === "object") collectToastItems(group as JsonObject, items);
    }
  }
}

/** Best-effort Toast Tab parser when HTML/JSON is reachable (often 403 for bots). */
export function parseToastMenuHtml(html: string): ParsedMenuResult | null {
  if (!/toasttab\.com/i.test(html)) return null;

  const items: MenuItemSeed[] = [];
  const nextData = parseNextData(html);
  if (nextData) {
    const candidates: JsonObject[] = [];
    walkForMenuNodes(nextData, candidates);
    for (const node of candidates) collectToastItems(node, items);
  }

  if (items.length < 3) return null;

  const categories: MenuCategorySeed[] = [{ name: "Menu", items: items.slice(0, 120) }];
  return { categories, source: "toast_json" };
}
