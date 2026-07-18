import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FreshnessControl, BUTTONS, TOAST_TEXT } from "./freshness-control";

/**
 * Honesty sentinels for the place-page freshness control (C2). We render static
 * markup (no browser) and inspect the exported copy. The control must never
 * imply that a user tap is a safety verification: no tier label, no count, no
 * checkmark, no affirmative "Confirm/Confirmed", and the toast must carry the
 * fixed non-endorsing disclaimer with no count/timestamp/checkmark.
 */

const markup = renderToStaticMarkup(
  createElement(FreshnessControl, {
    restaurantId: "11111111-1111-1111-1111-111111111111",
  }),
);

// The whole surface a diner could read: rendered markup + every button label +
// the toast copy (the toast lives behind click state, so include it explicitly).
const surface = [markup, ...BUTTONS.map((b) => b.label), TOAST_TEXT].join("\n");

test("control markup carries no tier label", () => {
  // Curated whitelist tiers + the DB column + the human labels must never appear
  // on this non-endorsing control.
  const tierTokens = [
    "allergy_safety_tier",
    "dedicated",
    "strong_protocol",
    "shared_verify",
    "Why this rating",
  ];
  for (const token of tierTokens) {
    assert.ok(
      !surface.toLowerCase().includes(token.toLowerCase()),
      `freshness control must not surface a tier token: ${token}`,
    );
  }
});

test("control surface carries no count or timestamp", () => {
  // No aggregate/count phrasing, no "ago"/date phrasing that would read as a
  // freshness receipt.
  assert.ok(
    !/\b(\d+\s+(reports?|signals?|people|users?|votes?)|count|total|ago|last checked)\b/i.test(
      surface,
    ),
    "freshness control must not surface a count or timestamp",
  );
});

test("control surface carries no checkmark", () => {
  for (const check of ["✓", "✔", "checkmark", "✓", "✔"]) {
    assert.ok(!surface.includes(check), `must not surface a checkmark: ${check}`);
  }
});

test("no button is an affirmative Confirm/Confirmed", () => {
  for (const b of BUTTONS) {
    assert.ok(
      !/\bconfirm(ed)?\b/i.test(b.label),
      `button label must not use an affirmative "Confirm": ${b.label}`,
    );
  }
  // The rendered button text as a whole is free of the word too.
  assert.ok(!/\bconfirm(ed)?\b/i.test(markup), "rendered markup must not say Confirm/Confirmed");
});

test("toast contains the non-endorsing disclaimer", () => {
  assert.match(TOAST_TEXT, /not a safety confirmation/i);
  assert.match(TOAST_TEXT, /verify allergen safety with the restaurant/i);
  // And carries nothing that reads as a receipt.
  assert.ok(!/\d/.test(TOAST_TEXT), "toast must contain no count/number");
  assert.ok(!/[✓✔]/.test(TOAST_TEXT), "toast must contain no checkmark");
});
