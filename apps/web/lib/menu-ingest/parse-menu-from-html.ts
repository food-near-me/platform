import { parseBentoBoxMenuHtml } from "./parse-bentobox";
import { parseGenericPlatformMenuHtml } from "./parse-generic-platform";
import { parseMenuFromJsonLdHtml } from "./json-ld-menu";
import {
  parseHeuristicMenuHtml,
  parseMicrodataMenuHtml,
  parseSquarespaceMenuHtml,
} from "./parse-html-menu";
import { parseSquarespaceRichHtml } from "./parse-squarespace-rich";
import { parseVisibleTextMenu } from "./parse-visible-text";
import { parseOrderOnlineMenuHtml } from "./parse-order-online";
import { parseSauceMenuHtml } from "./parse-sauce";
import { parseSpotAppsMenuHtml } from "./parse-spotapps";
import { parseSquareOnlineMenuHtml } from "./parse-square-online";
import { parseToastApolloHtml, parseToastMenuHtml } from "./parse-toast";
import type { ParsedMenuResult } from "./types";

export type MenuParseAttempt = {
  result: ParsedMenuResult | null;
  parser: string | null;
};

const GENERIC_PARSERS: Array<{
  id: string;
  parse: (html: string) => ParsedMenuResult | null;
}> = [
  { id: "toast_apollo", parse: parseToastApolloHtml },
  { id: "json_ld", parse: parseMenuFromJsonLdHtml },
  { id: "bentobox_jsonld", parse: parseBentoBoxMenuHtml },
  { id: "squarespace_rich", parse: parseSquarespaceRichHtml },
  { id: "squarespace_html", parse: parseSquarespaceMenuHtml },
  { id: "spotapps_html", parse: parseSpotAppsMenuHtml },
  { id: "microdata", parse: parseMicrodataMenuHtml },
  { id: "html_heuristic", parse: parseHeuristicMenuHtml },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function parseMenuFromHtml(html: string): MenuParseAttempt {
  for (const parser of GENERIC_PARSERS) {
    const result = parser.parse(html);
    if (result) {
      return { result, parser: parser.id };
    }
  }
  return { result: null, parser: null };
}

/** Host-aware parser — platform pages first, then generic HTML parsers. */
export function parseMenuForUrl(html: string, url: string): MenuParseAttempt {
  const host = hostOf(url);

  if (host.includes("getsauce.com")) {
    const result = parseSauceMenuHtml(html);
    if (result) return { result, parser: "sauce_next_data" };
  }

  if (host.includes("toasttab.com") || /order\.toasttab\.com/i.test(host)) {
    const result = parseToastMenuHtml(html);
    if (result) return { result, parser: "toast_apollo" };
  }

  if (/"__typename":"MenuItem"/.test(html)) {
    const result = parseToastApolloHtml(html);
    if (result) return { result, parser: "toast_apollo" };
  }

  if (host.includes("spotapps.co")) {
    const result = parseSpotAppsMenuHtml(html);
    if (result) return { result, parser: "spotapps_html" };
  }

  if (host.includes("square.site") || host.includes("squareup.com")) {
    const result = parseSquareOnlineMenuHtml(html);
    if (result) return { result, parser: "square_online_json" };
  }

  if (host.includes("order.online")) {
    const result = parseOrderOnlineMenuHtml(html);
    if (result) return { result, parser: "order_online_rsc" };
  }

  if (host.includes("chownow.com")) {
    const result = parseGenericPlatformMenuHtml(html, "chownow");
    if (result) return { result, parser: "chownow_json" };
  }

  if (host.includes("popmenu.com")) {
    const result = parseGenericPlatformMenuHtml(html, "popmenu");
    if (result) return { result, parser: "popmenu_json" };
  }

  if (host.includes("olo.com")) {
    const result = parseGenericPlatformMenuHtml(html, "olo");
    if (result) return { result, parser: "olo_json" };
  }

  if (host.includes("menufy.com") || host.includes("gloriafood.com")) {
    const result = parseGenericPlatformMenuHtml(html, "popmenu");
    if (result) return { result, parser: "popmenu_json" };
  }

  return parseMenuFromHtml(html);
}

/** Try visible page text when HTML parsers miss (Wix, heavy JS menus). */
export function parseMenuFromVisibleText(
  visibleText: string,
): MenuParseAttempt {
  const result = parseVisibleTextMenu(visibleText);
  if (result) return { result, parser: "visible_text" };
  return { result: null, parser: null };
}
