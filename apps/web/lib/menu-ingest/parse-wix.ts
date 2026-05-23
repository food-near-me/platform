import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

/**
 * Wix Restaurants parser.
 *
 * Wix sites embed restaurant menu data via the Wix Restaurants app. Across the
 * old "Menus", new "Restaurants Menus", and "Restaurants Orders" app variants
 * the JSON shapes differ but consistently contain:
 *   - an array of sections / categories with a string `name` or `title`
 *   - inside each, an array of items with `name`/`title` and a numeric `price`
 *     (sometimes nested under `price.value` or formatted as a `priceText`)
 *
 * Common embedding locations we scan:
 *   - <script id="wix-warmup-data">{...}</script>
 *   - <script type="application/json">{...}</script>
 *   - JSON inside `wixApps`/`__WIX_RESTAURANTS_*` window state blobs
 *
 * The parser is intentionally tolerant: we recursively walk every JSON shape
 * found in the HTML and harvest any object that looks like a sectioned menu.
 */

const WIX_FINGERPRINTS = [
  "static.wixstatic.com",
  "wix-warmup-data",
  "wix-clients",
  "_wixCIDX",
  "wixSdk",
  "wix-restaurants",
  "wixapps",
];

const SECTION_KEYS = ["sections", "menu_sections", "menuSections", "categories"];
const ITEM_KEYS = ["items", "menuItems", "dishes"];

type JsonObject = Record<string, unknown>;

function isWixHtml(html: string): boolean {
  return WIX_FINGERPRINTS.some((marker) => html.includes(marker));
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Extract every `<script>...</script>` blob whose body parses as JSON. */
function extractJsonBlobs(html: string): unknown[] {
  const blobs: unknown[] = [];

  const scriptPattern =
    /<script\b[^>]*(?:type=["'](?:application\/(?:ld\+)?json|application\/json)["']|id=["'][^"']*wix[^"']*["'])[^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    const body = match[1].trim();
    if (!body || body.length < 8) continue;
    tryParseInto(blobs, body);
  }

  // Also try inline JSON literals assigned to window.__WIX_*__ blobs.
  const wixGlobalPattern =
    /window\.(?:__WIX_[A-Z0-9_]+__|wixApps|wixBiSession)\s*=\s*(\{[\s\S]*?\});/g;
  for (const match of html.matchAll(wixGlobalPattern)) {
    tryParseInto(blobs, match[1]);
  }

  return blobs;
}

function tryParseInto(out: unknown[], raw: string): void {
  try {
    out.push(JSON.parse(raw));
  } catch {
    // Some Wix blobs are doubly encoded as a quoted JSON string.
    if (raw.startsWith('"') && raw.endsWith('"')) {
      try {
        const unquoted = JSON.parse(raw) as unknown;
        if (typeof unquoted === "string") tryParseInto(out, unquoted);
      } catch {
        /* ignore */
      }
    }
  }
}

function pickString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

/** Pull a numeric price out of the various shapes Wix uses. */
function parsePrice(node: JsonObject): number {
  const direct = node.price ?? node.price_value ?? node.amount ?? node.unitPrice;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  if (typeof direct === "string") {
    const cleaned = direct.replace(/[^0-9.]/g, "");
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const offer = asObject(node.offer) ?? asObject(node.offers) ?? asObject(node.priceInfo);
  if (offer) return parsePrice(offer);

  const priceObj = asObject(node.price);
  if (priceObj) {
    const value = priceObj.value ?? priceObj.amount ?? priceObj.formattedValue;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/[^0-9.]/g, "");
      const parsed = Number.parseFloat(cleaned);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  const formatted = pickString(node.priceText, node.formattedPrice, node.displayPrice);
  if (formatted) {
    const cleaned = formatted.replace(/[^0-9.]/g, "");
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 0;
}

function looksLikeMenuItem(node: unknown): node is JsonObject {
  const obj = asObject(node);
  if (!obj) return false;
  const name = pickString(obj.name, obj.title, obj.itemName);
  if (!name || name.length < 2 || name.length > 120) return false;
  if (parsePrice(obj) <= 0) return false;
  return true;
}

function buildItem(node: JsonObject): MenuItemSeed | null {
  const name = pickString(node.name, node.title, node.itemName);
  if (!name) return null;
  const price = parsePrice(node);
  if (price <= 0 || price >= 500) return null;

  const description = pickString(node.description, node.summary, node.shortDescription);

  return { name, price, description: description ?? undefined };
}

/**
 * Walk the JSON tree breadth-first and collect every sectioned menu node we
 * find. A node qualifies when it has both a section/category container key
 * AND at least one nested item that looks like a priced menu entry.
 */
function harvestCategories(data: unknown): MenuCategorySeed[] {
  const categories: MenuCategorySeed[] = [];
  const queue: unknown[] = [data];
  const seen = new WeakSet<object>();

  while (queue.length > 0) {
    const next = queue.shift();
    if (Array.isArray(next)) {
      next.forEach((entry) => queue.push(entry));
      continue;
    }
    const obj = asObject(next);
    if (!obj) continue;
    if (seen.has(obj)) continue;
    seen.add(obj);

    for (const sectionKey of SECTION_KEYS) {
      const sections = asArray(obj[sectionKey]);
      if (sections.length === 0) continue;

      for (const section of sections) {
        const sectionObj = asObject(section);
        if (!sectionObj) continue;

        const sectionName =
          pickString(sectionObj.name, sectionObj.title, sectionObj.displayName) ?? "Menu";

        const itemArrays = ITEM_KEYS.map((key) => asArray(sectionObj[key])).flat();
        const items = itemArrays
          .filter(looksLikeMenuItem)
          .map(buildItem)
          .filter((value): value is MenuItemSeed => value !== null);

        if (items.length > 0) {
          categories.push({ name: sectionName.slice(0, 80), items });
        } else {
          queue.push(sectionObj);
        }
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return categories;
}

function dedupeCategories(categories: MenuCategorySeed[]): MenuCategorySeed[] {
  const seen = new Set<string>();
  const result: MenuCategorySeed[] = [];

  for (const cat of categories) {
    const dedupedItems: MenuItemSeed[] = [];
    for (const item of cat.items) {
      const key = `${cat.name.toLowerCase()}|${item.name.toLowerCase()}|${item.price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedItems.push(item);
    }
    if (dedupedItems.length > 0) {
      result.push({ name: cat.name, items: dedupedItems });
    }
  }

  return result;
}

export function parseWixMenuHtml(html: string): ParsedMenuResult | null {
  if (!isWixHtml(html)) return null;

  const blobs = extractJsonBlobs(html);
  if (blobs.length === 0) return null;

  const allCategories: MenuCategorySeed[] = [];
  for (const blob of blobs) {
    allCategories.push(...harvestCategories(blob));
  }

  const categories = dedupeCategories(allCategories);
  const total = categories.reduce((n, c) => n + c.items.length, 0);
  if (total < 3) return null;

  return { categories, source: "wix_json" };
}
