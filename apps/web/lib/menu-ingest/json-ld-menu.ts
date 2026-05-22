import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

type JsonObject = Record<string, unknown>;

const MENU_TYPES = new Set(["Menu", "FoodEstablishment"]);
const SECTION_TYPES = new Set(["MenuSection"]);
const ITEM_TYPES = new Set(["MenuItem"]);

function normalizeType(value: unknown): string[] {
  if (typeof value === "string") {
    return [value.replace(/^https?:\/\/schema\.org\//i, "")];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeType(entry));
  }
  return [];
}

function hasType(node: JsonObject, allowed: Set<string>): boolean {
  return normalizeType(node["@type"]).some((type) => allowed.has(type));
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parsePrice(offers: unknown): number | null {
  const offer = asObject(offers) ?? asArray(offers).map(asObject).find(Boolean);
  if (!offer) return null;

  const price = offer.price ?? offer.lowPrice ?? offer.highPrice;
  if (typeof price === "number" && Number.isFinite(price)) return price;
  if (typeof price === "string") {
    const parsed = Number.parseFloat(price.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseMenuItem(node: JsonObject): MenuItemSeed | null {
  if (!hasType(node, ITEM_TYPES) && !node.name) return null;

  const name = typeof node.name === "string" ? node.name.trim() : "";
  if (!name) return null;

  const price = parsePrice(node.offers);
  if (price === null || price <= 0) return null;

  const description =
    typeof node.description === "string" ? node.description.trim() : undefined;

  const diets = asArray(node.suitableForDiet).flatMap((d) =>
    typeof d === "string" ? [d.toLowerCase()] : [],
  );

  return {
    name,
    description,
    price,
    dietary_vegetarian: diets.some((d) => d.includes("vegetarian")),
    dietary_vegan: diets.some((d) => d.includes("vegan")),
    dietary_gluten_free: diets.some((d) => d.includes("glutenfree")),
  };
}

function collectMenuItems(node: JsonObject, bucket: MenuItemSeed[]): void {
  if (hasType(node, ITEM_TYPES)) {
    const item = parseMenuItem(node);
    if (item) bucket.push(item);
  }

  for (const key of ["hasMenuItem", "menuAddItem"]) {
    for (const child of asArray(node[key])) {
      const obj = asObject(child);
      if (obj) collectMenuItems(obj, bucket);
    }
  }
}

function collectSections(node: JsonObject, categories: MenuCategorySeed[]): void {
  if (hasType(node, SECTION_TYPES)) {
    const items: MenuItemSeed[] = [];
    collectMenuItems(node, items);
    if (items.length > 0) {
      const name =
        typeof node.name === "string" && node.name.trim()
          ? node.name.trim()
          : "Menu";
      categories.push({ name, items });
    }
  }

  for (const key of ["hasMenuSection", "hasMenu", "menu"]) {
    for (const child of asArray(node[key])) {
      const obj = asObject(child);
      if (!obj) continue;
      if (hasType(obj, MENU_TYPES) || hasType(obj, SECTION_TYPES)) {
        collectSections(obj, categories);
      } else {
        collectMenuItems(obj, []);
      }
    }
  }
}

function flattenJsonLd(data: unknown): JsonObject[] {
  const nodes: JsonObject[] = [];

  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const obj = asObject(value);
    if (!obj) return;

    nodes.push(obj);
    if (obj["@graph"]) walk(obj["@graph"]);
  };

  walk(data);
  return nodes;
}

export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // ignore malformed blocks
    }
  }

  return blocks;
}

export function parseMenuFromJsonLdHtml(html: string): ParsedMenuResult | null {
  const blocks = extractJsonLdBlocks(html);
  if (blocks.length === 0) return null;

  const categories: MenuCategorySeed[] = [];
  const looseItems: MenuItemSeed[] = [];

  for (const block of blocks) {
    for (const node of flattenJsonLd(block)) {
      if (hasType(node, MENU_TYPES) || node.hasMenuSection || node.hasMenu) {
        collectSections(node, categories);
      }
      if (hasType(node, SECTION_TYPES)) {
        collectSections(node, categories);
      }
      if (hasType(node, ITEM_TYPES)) {
        const item = parseMenuItem(node);
        if (item) looseItems.push(item);
      }
      if (node.hasMenu) {
        for (const menu of asArray(node.hasMenu)) {
          const menuObj = asObject(menu);
          if (menuObj) collectSections(menuObj, categories);
        }
      }
    }
  }

  if (categories.length === 0 && looseItems.length > 0) {
    categories.push({ name: "Menu", items: looseItems });
  }

  const totalItems = categories.reduce((n, c) => n + c.items.length, 0);
  if (totalItems === 0) return null;

  return { categories, source: "json_ld" };
}
