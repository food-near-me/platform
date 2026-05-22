const DEFAULT_TIMEOUT_MS = 12_000;
/** Browser-like UA — some menu platforms block obvious bots. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type FetchWebsiteOptions = {
  timeoutMs?: number;
  /** After static fetch fails or parse misses, render with Playwright. */
  headless?: boolean;
};

export async function fetchWebsiteHtml(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("application/json")
    ) {
      throw new Error(`Unexpected content-type: ${contentType || "unknown"}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWebsiteHtmlStaticOptional(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string | null> {
  try {
    return await fetchWebsiteHtml(url, timeoutMs);
  } catch {
    return null;
  }
}

/** @deprecated use fetchWebsiteHtmlStaticOptional */
export const fetchWebsiteHtmlOptional = fetchWebsiteHtmlStaticOptional;

/**
 * Static fetch first; optional Playwright render when static fails or `forceHeadless`.
 */
export async function fetchWebsiteHtmlWithFallback(
  url: string,
  options: FetchWebsiteOptions = {},
): Promise<{ html: string | null; via: "static" | "headless" | null }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staticHtml = await fetchWebsiteHtmlStaticOptional(url, timeoutMs);
  if (staticHtml && !options.headless) {
    return { html: staticHtml, via: "static" };
  }

  if (staticHtml && options.headless) {
    return { html: staticHtml, via: "static" };
  }

  if (options.headless) {
    const { fetchWebsiteHtmlPlaywright } = await import("./fetch-website-playwright");
    const rendered = await fetchWebsiteHtmlPlaywright(url, timeoutMs + 16_000);
    if (rendered) return { html: rendered, via: "headless" };
  }

  return { html: staticHtml, via: staticHtml ? "static" : null };
}

/**
 * Try static HTML, then headless render if enabled and static did not produce a menu.
 */
export async function fetchForMenuParse(
  url: string,
  options: FetchWebsiteOptions & {
    headless?: boolean;
    needsHeadlessRetry?: boolean;
  },
): Promise<{ html: string | null; via: "static" | "headless" | null }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staticHtml = await fetchWebsiteHtmlStaticOptional(url, timeoutMs);

  if (staticHtml && !options.needsHeadlessRetry) {
    return { html: staticHtml, via: "static" };
  }

  if (options.headless && (options.needsHeadlessRetry || !staticHtml)) {
    const { fetchWebsiteHtmlPlaywright } = await import("./fetch-website-playwright");
    const rendered = await fetchWebsiteHtmlPlaywright(url, timeoutMs + 16_000);
    if (rendered) return { html: rendered, via: "headless" };
  }

  return { html: staticHtml, via: staticHtml ? "static" : null };
}
