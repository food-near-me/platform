/** URLs that must never be treated as menu sources. */
const BLOCKED_MENU_URL =
  /(?:squareup\.com\/(?:us\/)?en\/legal|toasttab\.com\/(?:tps-)?licenses|getbento\.com\/(?:terms|privacy)|pos\.toasttab\.com\/(?:privacy|terms))/i;

const DELIVERY_MENU_HOST =
  /(?:ubereats|postmates|doordash|grubhub|seamless)\.com/i;

export function isBlockedMenuUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    const full = `${hostname}${pathname}`;
    if (BLOCKED_MENU_URL.test(full)) return true;
    if (DELIVERY_MENU_HOST.test(hostname)) return true;
    if (/^\/legal\b|^\/terms\b|^\/privacy\b/i.test(pathname)) return true;
    return false;
  } catch {
    return true;
  }
}

export function filterMenuProbeUrls(urls: string[]): string[] {
  return urls.filter((url) => !isBlockedMenuUrl(url));
}
