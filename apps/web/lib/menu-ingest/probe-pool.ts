import type { MenuProbeOutcome, ProbeWebsiteOptions } from "./probe-website-menu";
import { probeWebsiteForMenu } from "./probe-website-menu";

export function emptyProbeOutcome(): MenuProbeOutcome {
  return {
    parsed: null,
    matchedUrl: null,
    parser: null,
    fetchVia: null,
    triedUrls: [],
    discoveredUrls: [],
    deliveryUrls: [],
  };
}

export async function probeWebsiteForMenuWithTimeout(
  websiteUrl: string,
  options: ProbeWebsiteOptions = {},
  timeoutMs = 90_000,
): Promise<MenuProbeOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<MenuProbeOutcome>((resolve) => {
    timer = setTimeout(() => resolve(emptyProbeOutcome()), timeoutMs);
  });

  try {
    return await Promise.race([probeWebsiteForMenu(websiteUrl, options), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run async work with a fixed concurrency limit (e.g. parallel menu probes).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, concurrency);
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
