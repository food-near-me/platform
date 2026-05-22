import type { MenuCategorySeed, MenuItemSeed, ParsedMenuResult } from "./types";

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePriceFromText(text: string): number | null {
  const match = text.match(/\$\s*(\d+(?:\.\d{2})?)/);
  if (!match) return null;
  const price = Number.parseFloat(match[1]);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * Squarespace 7.x rich text blocks (sqs-html-content) — category headings + priced lines.
 */
export function parseSquarespaceRichHtml(html: string): ParsedMenuResult | null {
  if (!html.includes("sqs-html-content") && !html.includes("sqs-block-content")) {
    return null;
  }

  const categories: MenuCategorySeed[] = [];
  let current: MenuCategorySeed = { name: "Menu", items: [] };

  const blockPattern =
    /<div[^>]*class="[^"]*sqs-html-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

  for (const match of html.matchAll(blockPattern)) {
    const blockHtml = match[1];
    const headings = [...blockHtml.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(
      (m) => stripTags(m[1]),
    );

    if (headings.length > 0 && current.items.length > 0) {
      categories.push(current);
      current = { name: headings[0] || "Menu", items: [] };
    } else if (headings.length > 0 && current.name === "Menu") {
      current.name = headings[0];
    }

    const text = stripTags(blockHtml);
    for (const line of text.split(/\n+/)) {
      const trimmed = line.trim();
      if (trimmed.length < 4) continue;

      const price = parsePriceFromText(trimmed);
      if (!price) continue;

      const name = trimmed.replace(/\$\s*\d+(?:\.\d{2})?.*$/, "").trim();
      if (name.length < 3 || name.length > 80) continue;
      if (/^(total|subtotal|tax|tip|gratuity)/i.test(name)) continue;

      current.items.push({ name, price });
    }
  }

  if (current.items.length > 0) categories.push(current);

  const total = categories.reduce((n, c) => n + c.items.length, 0);
  if (total < 3) return null;

  return { categories, source: "squarespace_html" };
}
