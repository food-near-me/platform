import { extractJsonLdBlocks } from "./json-ld-menu";
import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

type JsonObject = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function normalizeType(value: unknown): string {
  if (typeof value === "string") return value.replace(/^https?:\/\/schema\.org\//i, "");
  if (Array.isArray(value)) return String(value[0] ?? "");
  return "";
}

function parsePrice(offers: unknown): number {
  const offer = asObject(offers) ?? asArray(offers).map(asObject).find(Boolean);
  if (!offer) return 0;
  const price = offer.price ?? offer.lowPrice ?? offer.highPrice;
  if (typeof price === "number" && Number.isFinite(price)) return price;
  if (typeof price === "string") {
    const parsed = Number.parseFloat(price.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseMenuItem(node: JsonObject): MenuItemSeed | null {
  if (normalizeType(node["@type"]) !== "MenuItem") return null;
  const name = typeof node.name === "string" ? node.name.trim() : "";
  if (!name || name.length < 2) return null;

  const description =
    typeof node.description === "string" ? node.description.trim() : undefined;

  return {
    name,
    description: description || undefined,
    price: parsePrice(node.offers),
  };
}

function flattenNodes(data: unknown): JsonObject[] {
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

/** BentoBox sites embed schema.org Menu JSON-LD; prices are often omitted. */
export function parseBentoBoxMenuHtml(html: string): ParsedMenuResult | null {
  if (!/getbento\.com|bentobox/i.test(html)) return null;

  const blocks = extractJsonLdBlocks(html);
  const categories: MenuCategorySeed[] = [];

  for (const block of blocks) {
    for (const node of flattenNodes(block)) {
      if (normalizeType(node["@type"]) !== "Menu") continue;

      const menuName =
        typeof node.name === "string" && node.name.trim() ? node.name.trim() : "Menu";
      const sections = asArray(node.hasMenuSection).map(asObject).filter(Boolean) as JsonObject[];

      for (const section of sections) {
        const sectionName =
          typeof section.name === "string" && section.name.trim()
            ? section.name.trim()
            : menuName;
        const items = asArray(section.hasMenuItem)
          .map(asObject)
          .filter(Boolean)
          .map((item) => parseMenuItem(item as JsonObject))
          .filter(Boolean) as MenuItemSeed[];

        if (items.length > 0) {
          categories.push({ name: sectionName, items });
        }
      }

      const looseItems = asArray(node.hasMenuItem)
        .map(asObject)
        .filter(Boolean)
        .map((item) => parseMenuItem(item as JsonObject))
        .filter(Boolean) as MenuItemSeed[];

      if (looseItems.length > 0) {
        categories.push({ name: menuName, items: looseItems });
      }
    }
  }

  const totalItems = categories.reduce((n, c) => n + c.items.length, 0);
  if (totalItems < 3) return null;

  return { categories, source: "bentobox_jsonld" };
}
