export type Bbox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

/** National/regional chains — store pages rarely expose JSON-LD menus. */
const CHAIN_HOST_SUFFIXES = [
  "mcdonalds.com",
  "burgerking.com",
  "bk.com",
  "wendys.com",
  "dunkindonuts.com",
  "whitecastle.com",
  "popeyes.com",
  "subway.com",
  "chipotle.com",
  "starbucks.com",
  "dominos.com",
  "pizzahut.com",
  "tacobell.com",
  "kfc.com",
  "arbys.com",
  "chick-fil-a.com",
  "fiveguys.com",
  "panerabread.com",
  "papajohns.com",
  "littlecaesars.com",
  "sonicdrivein.com",
  "jackinthebox.com",
  "culvers.com",
  "raisingcanes.com",
  "buffalowildwings.com",
  "applebees.com",
  "olivegarden.com",
  "outback.com",
  "ihop.com",
  "dennys.com",
  "crackerbarrel.com",
  "chilis.com",
  "tropicalsmoothiecafe.com",
  "smoothieking.com",
  "jerseymikes.com",
  "firehousesubs.com",
  "potbelly.com",
  "noodles.com",
  "qdoba.com",
  "moes.com",
  "cava.com",
  "sweetgreen.com",
  "shakeshack.com",
  "in-n-out.com",
  "whataburger.com",
  "zaxbys.com",
  "bojangles.com",
  "pandaexpress.com",
  "timhortons.com",
  "7-eleven.com",
];

const LOCATOR_PATH_PATTERNS = [
  /\/store-locator\b/i,
  /\/locations?\//i,
  /\/location\//i,
  /\/stores?\//i,
  /\/restaurant_\d/i,
  /\/en-us\/location\//i,
  /\/us\/en-us\/location\//i,
  /\/find-a-restaurant\b/i,
  /\/restaurant-locator\b/i,
];

const MENU_PATH_HINTS = [
  "/menu",
  "/menus",
  "/menu-2",
  "/food-menu",
  "/our-menu",
  "/order",
  "/food",
  "/dining",
  "/eat",
  "/brunch",
  "/lunch",
  "/dinner",
  "/drinks",
  "/beverages",
  "/cocktails",
  "/wine",
  "/beer",
];

export type WebsiteCandidate = {
  id: string;
  name: string;
  website_url: string;
  score: number;
  skipReason?: string;
};

export function normalizeWebsiteUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isChainHost(url: string): boolean {
  const host = hostnameOf(url);
  if (!host) return false;
  return CHAIN_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function isLocatorUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return LOCATOR_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
  } catch {
    return false;
  }
}

export function scoreWebsiteUrl(url: string): number {
  let score = 0;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();

    if (isLocatorUrl(url)) score -= 40;
    if (isChainHost(url)) score -= 50;

    for (const hint of MENU_PATH_HINTS) {
      if (path.includes(hint)) score += 25;
    }

    if (path === "/" || path === "") score += 5;

    // Prefer independent-looking apex domains over deep franchise paths
    const depth = path.split("/").filter(Boolean).length;
    if (depth <= 1) score += 8;
    if (depth >= 4) score -= 6;
  } catch {
    score -= 100;
  }

  return score;
}

export function getSkipReason(url: string, includeChains: boolean): string | null {
  if (!includeChains && isChainHost(url)) {
    return `chain domain (${hostnameOf(url) ?? url})`;
  }
  if (isLocatorUrl(url)) {
    return "store locator URL (will probe /menu on site root)";
  }
  return null;
}

const PLATFORM_ORDERING_HOST =
  /(?:toasttab|spotapps|order\.online|getsauce|chownow|toasttab|square\.site|squareup)\./i;

export function buildMenuProbeUrls(websiteUrl: string): string[] {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) return [];

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return [normalized];
  }

  if (PLATFORM_ORDERING_HOST.test(parsed.hostname)) {
    return [normalized];
  }

  const origin = parsed.origin;
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  const ordered: string[] = [];

  const push = (url: string) => {
    if (!ordered.includes(url)) ordered.push(url);
  };

  const locator = isLocatorUrl(normalized);

  if (!locator && path !== "/") {
    push(normalized);
  }

  push(`${origin}/`);

  for (const hint of MENU_PATH_HINTS) {
    push(`${origin}${hint}`);
    push(`${origin}${hint}/`);
  }

  if (locator) {
    // Locator pages are last-resort — homepage + /menu paths above are preferred
    push(normalized);
  }

  return ordered;
}

export function rankWebsiteCandidates<
  T extends { id: string; name: string; website_url: string | null },
>(rows: T[], options: { includeChains: boolean }): WebsiteCandidate[] {
  const ranked: WebsiteCandidate[] = [];

  for (const row of rows) {
    const website_url = normalizeWebsiteUrl(row.website_url ?? "");
    if (!website_url) continue;

    const skipReason = getSkipReason(website_url, options.includeChains);
    if (skipReason?.startsWith("chain domain")) {
      continue;
    }

    ranked.push({
      id: row.id,
      name: row.name,
      website_url,
      score: scoreWebsiteUrl(website_url),
      skipReason: skipReason ?? undefined,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function bboxCenter(bbox: Bbox): { lat: number; lng: number } {
  return {
    lat: (bbox.south + bbox.north) / 2,
    lng: (bbox.west + bbox.east) / 2,
  };
}

/** Radius in meters for one cell in an N×N grid over the bbox. */
export function gridCellRadiusMeters(bbox: Bbox, divisions: number): number {
  const latMid = (bbox.south + bbox.north) / 2;
  const latSpan = (bbox.north - bbox.south) / divisions;
  const lngSpan = (bbox.east - bbox.west) / divisions;
  const latM = latSpan * 111_000;
  const lngM = lngSpan * 111_000 * Math.cos((latMid * Math.PI) / 180);
  return Math.sqrt(latM * latM + lngM * lngM) * 1.35;
}

export function gridSamplePoints(bbox: Bbox, divisions: number): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  for (let row = 0; row < divisions; row++) {
    for (let col = 0; col < divisions; col++) {
      points.push({
        lat: bbox.south + ((bbox.north - bbox.south) * (row + 0.5)) / divisions,
        lng: bbox.west + ((bbox.east - bbox.west) * (col + 0.5)) / divisions,
      });
    }
  }
  return points;
}
