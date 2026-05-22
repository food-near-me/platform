import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return raw.replace(/\\"/g, '"').replace(/\\n/g, " ").trim();
  }
}

/** Toast Tab online ordering embeds Apollo cache with MenuGroup / MenuItem nodes. */
export function parseToastApolloHtml(html: string): ParsedMenuResult | null {
  if (!/"__typename":"MenuItem"/.test(html)) return null;

  const groupNames = new Map<string, string>();
  for (const match of html.matchAll(
    /"__typename":"MenuGroup","name":"((?:\\.|[^"\\])*)","description":"(?:\\.|[^"\\])*","guid":"([^"]+)"/g,
  )) {
    groupNames.set(match[2], decodeJsonString(match[1]));
  }

  const byGroup = new Map<string, MenuItemSeed[]>();
  const seen = new Set<string>();

  for (const chunk of html.split('"__typename":"MenuItem"').slice(1)) {
    const nameRaw = chunk.match(/"name":"((?:\\.|[^"\\])*)"/)?.[1];
    const priceRaw = chunk.match(/"prices":\[(\d+(?:\.\d+)?)/)?.[1];
    const groupGuid = chunk.match(/"itemGroupGuid":"([^"]+)"/)?.[1] ?? "menu";
    if (!nameRaw || !priceRaw) continue;

    const name = decodeJsonString(nameRaw);
    const price = Number.parseFloat(priceRaw);
    if (name.length < 2 || !Number.isFinite(price) || price <= 0) continue;

    const key = `${name.toLowerCase()}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const list = byGroup.get(groupGuid) ?? [];
    list.push({ name, price });
    byGroup.set(groupGuid, list);
  }

  const categories: MenuCategorySeed[] = [];
  for (const [guid, items] of byGroup) {
    if (items.length === 0) continue;
    categories.push({
      name: groupNames.get(guid) ?? "Menu",
      items: items.slice(0, 150),
    });
  }

  const total = categories.reduce((n, c) => n + c.items.length, 0);
  if (total < 3) return null;

  return { categories, source: "toast_apollo" };
}

export function parseToastMenuHtml(html: string): ParsedMenuResult | null {
  return parseToastApolloHtml(html);
}
