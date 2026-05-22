import { extractJsonValueForKey } from "./extract-embedded-json";
import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

type OrderOnlineItem = {
  __typename?: string;
  id?: string;
  name?: string;
  description?: string | null;
  displayPrice?: string | null;
};

type OrderOnlineItemList = {
  __typename?: string;
  id?: string;
  name?: string;
  description?: string | null;
  items?: OrderOnlineItem[];
};

function decodeRscString(raw: string): string {
  return raw
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\u0026/g, "&")
    .replace(/\\\\/g, "\\");
}

/** Collect decoded Next.js flight chunks that often hold menu JSON. */
function collectDecodedRscText(html: string): string {
  const chunks: string[] = [html];

  for (const match of html.matchAll(
    /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g,
  )) {
    chunks.push(decodeRscString(match[1]));
  }

  return chunks.join("\n");
}

function parseDisplayPrice(raw: string | null | undefined): number {
  if (!raw) return 0;
  const match = raw.replace(/\$/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const price = Number.parseFloat(match[1]);
  return Number.isFinite(price) ? price : 0;
}

function collectItemLists(text: string): OrderOnlineItemList[] {
  const lists: OrderOnlineItemList[] = [];
  const needle = '"itemLists":';
  let pos = 0;

  while (pos < text.length) {
    const idx = text.indexOf(needle, pos);
    if (idx === -1) break;
    const parsed = extractJsonValueForKey(text.slice(idx), "itemLists");
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (
          entry &&
          typeof entry === "object" &&
          (entry as OrderOnlineItemList).__typename === "MenuPageItemList"
        ) {
          lists.push(entry as OrderOnlineItemList);
        }
      }
    }
    pos = idx + needle.length;
  }

  return lists;
}

/**
 * Parse DoorDash Storefront (order.online) menus embedded in Next.js RSC payloads.
 */
export function parseOrderOnlineMenuHtml(html: string): ParsedMenuResult | null {
  if (
    !/order\.online|MenuPageItemList|OnlineOrderingStore|cdn4dd\.com/i.test(
      html,
    )
  ) {
    return null;
  }

  const decoded = collectDecodedRscText(html);
  const itemLists = collectItemLists(decoded);
  if (itemLists.length === 0) return null;

  const seenItemIds = new Set<string>();
  const categories: MenuCategorySeed[] = [];

  for (const list of itemLists) {
    const items: MenuItemSeed[] = [];
    for (const rawItem of list.items ?? []) {
      if (rawItem.__typename && rawItem.__typename !== "MenuPageItem") continue;
      const name = rawItem.name?.trim();
      if (!name) continue;
      const itemKey = rawItem.id ?? name;
      if (seenItemIds.has(itemKey)) continue;

      const price = parseDisplayPrice(rawItem.displayPrice);
      if (price <= 0) continue;

      seenItemIds.add(itemKey);
      items.push({
        name,
        description: rawItem.description?.trim() || undefined,
        price,
      });
    }

    if (items.length > 0) {
      categories.push({
        name: list.name?.trim() || "Menu",
        items,
      });
    }
  }

  const totalItems = categories.reduce((n, c) => n + c.items.length, 0);
  if (totalItems < 3) return null;

  return { categories, source: "order_online_rsc" };
}
