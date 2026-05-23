import assert from "node:assert/strict";
import { test } from "node:test";

import { parseWixMenuHtml } from "./parse-wix";

function wrapHtml(blob: object, fingerprint = "static.wixstatic.com"): string {
  return `<!doctype html><html><head>
<script src="https://${fingerprint}/wix.bundle.js"></script>
</head><body>
<script id="wix-warmup-data" type="application/json">${JSON.stringify(blob)}</script>
</body></html>`;
}

test("returns null on non-Wix HTML", () => {
  const html = "<html><body><h1>Plain page</h1></body></html>";
  assert.equal(parseWixMenuHtml(html), null);
});

test("parses classic Wix Restaurants Menus shape (sections + items)", () => {
  const blob = {
    menu: {
      sections: [
        {
          name: "Appetizers",
          items: [
            { name: "Burrata", description: "Cream and herbs", price: 14 },
            { name: "Octopus", price: 18.5 },
          ],
        },
        {
          title: "Mains",
          items: [
            { title: "Branzino", priceText: "$32" },
            { name: "Pasta", price: { value: 22 } },
          ],
        },
      ],
    },
  };
  const result = parseWixMenuHtml(wrapHtml(blob));
  assert.ok(result, "expected a parse result");
  assert.equal(result?.source, "wix_json");
  assert.equal(result?.categories.length, 2);
  const allItems = result!.categories.flatMap((c) => c.items);
  assert.equal(allItems.length, 4);
  const branzino = allItems.find((i) => i.name === "Branzino");
  assert.ok(branzino, "Branzino must be parsed from priceText");
  assert.equal(branzino?.price, 32);
});

test("parses new Wix Restaurants Orders shape (menus[].sections[].items[])", () => {
  const blob = {
    state: {
      restaurants: {
        menus: [
          {
            name: "Lunch",
            sections: [
              {
                name: "Salads",
                items: [
                  { name: "Caesar", price: "$11.50", description: "Classic" },
                  { name: "Greek", price: 13 },
                  { name: "Chop", price: 12 },
                ],
              },
            ],
          },
        ],
      },
    },
  };
  const result = parseWixMenuHtml(wrapHtml(blob, "wix-clients"));
  assert.ok(result);
  assert.equal(result?.categories[0].name, "Salads");
  assert.equal(result?.categories[0].items.length, 3);
  assert.equal(result?.categories[0].items[0].price, 11.5);
});

test("rejects sections with no priced items", () => {
  const blob = {
    sections: [
      { name: "Empty section", items: [{ name: "Mystery dish" }] },
    ],
  };
  assert.equal(parseWixMenuHtml(wrapHtml(blob)), null);
});

test("filters absurd prices but keeps valid ones", () => {
  const blob = {
    sections: [
      {
        name: "Drinks",
        items: [
          { name: "Espresso", price: 4 },
          { name: "Cappuccino", price: 5.5 },
          { name: "Rare Champagne", price: 9999 },
          { name: "Latte", price: 6 },
        ],
      },
    ],
  };
  const result = parseWixMenuHtml(wrapHtml(blob));
  assert.ok(result);
  const names = result!.categories[0].items.map((i) => i.name);
  assert.deepEqual(names.sort(), ["Cappuccino", "Espresso", "Latte"]);
});

test("dedupes identical items found across multiple JSON blobs", () => {
  const html = `<!doctype html><html><body>
<script src="https://static.wixstatic.com/x.js"></script>
<script type="application/json">${JSON.stringify({
    sections: [
      { name: "Bowls", items: [{ name: "Poke", price: 16 }, { name: "Buddha", price: 15 }, { name: "Quinoa", price: 14 }] },
    ],
  })}</script>
<script type="application/json">${JSON.stringify({
    menu: {
      sections: [
        { name: "Bowls", items: [{ name: "Poke", price: 16 }] },
      ],
    },
  })}</script>
</body></html>`;
  const result = parseWixMenuHtml(html);
  assert.ok(result);
  const bowls = result!.categories.find((c) => c.name === "Bowls");
  assert.ok(bowls);
  assert.equal(bowls!.items.filter((i) => i.name === "Poke").length, 1);
});
