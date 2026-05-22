import type { Browser } from "playwright";

let sharedBrowser: Browser | null = null;

export async function initPlaywrightBrowser(): Promise<void> {
  if (sharedBrowser) return;
  const { chromium } = await import("playwright");
  sharedBrowser = await chromium.launch({ headless: true });
}

export async function closePlaywrightBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

export type PlaywrightFetchResult = {
  html: string;
  visibleText: string;
};

export async function fetchWebsiteHtmlPlaywright(
  url: string,
  timeoutMs = 28_000,
): Promise<string | null> {
  const result = await fetchWebsiteWithPlaywright(url, timeoutMs);
  return result?.html ?? null;
}

export async function fetchWebsiteWithPlaywright(
  url: string,
  timeoutMs = 28_000,
): Promise<PlaywrightFetchResult | null> {
  try {
    await initPlaywrightBrowser();
    if (!sharedBrowser) return null;

    const page = await sharedBrowser.newPage({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });
      await page.waitForTimeout(2_500);
      const html = await page.content();
      const visibleText = await page.locator("body").innerText();
      return { html, visibleText };
    } finally {
      await page.close();
    }
  } catch {
    return null;
  }
}
