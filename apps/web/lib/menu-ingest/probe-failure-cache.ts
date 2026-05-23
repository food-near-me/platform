import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { websiteHostKey } from "./website-candidates";

export type ProbeFailureEntry = {
  host: string;
  failCount: number;
  lastFailedAt: string;
  lastReason?: string;
};

type ProbeFailureCacheFile = {
  version: 1;
  entries: Record<string, ProbeFailureEntry>;
};

const DEFAULT_CACHE_PATH = resolve(
  process.cwd(),
  "scripts/data/probe-failure-cache.json",
);

const DEFAULT_MIN_FAILURES = 3;
const DEFAULT_COOLDOWN_DAYS = 30;

function emptyCache(): ProbeFailureCacheFile {
  return { version: 1, entries: {} };
}

export function loadProbeFailureCache(cachePath = DEFAULT_CACHE_PATH): ProbeFailureCacheFile {
  if (!existsSync(cachePath)) return emptyCache();
  try {
    const raw = readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw) as ProbeFailureCacheFile;
    if (parsed.version !== 1 || !parsed.entries) return emptyCache();
    return parsed;
  } catch {
    return emptyCache();
  }
}

export function saveProbeFailureCache(
  cache: ProbeFailureCacheFile,
  cachePath = DEFAULT_CACHE_PATH,
): void {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function shouldSkipProbeHost(
  websiteUrl: string,
  cache: ProbeFailureCacheFile,
  options?: { minFailures?: number; cooldownDays?: number; now?: Date },
): ProbeFailureEntry | null {
  const host = websiteHostKey(websiteUrl);
  if (!host) return null;

  const entry = cache.entries[host];
  if (!entry) return null;

  const minFailures = options?.minFailures ?? DEFAULT_MIN_FAILURES;
  const cooldownDays = options?.cooldownDays ?? DEFAULT_COOLDOWN_DAYS;
  const now = options?.now ?? new Date();

  if (entry.failCount < minFailures) return null;

  const lastFailed = new Date(entry.lastFailedAt);
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  if (now.getTime() - lastFailed.getTime() < cooldownMs) {
    return entry;
  }

  return null;
}

export function recordProbeFailure(
  websiteUrl: string,
  cache: ProbeFailureCacheFile,
  reason?: string,
): void {
  const host = websiteHostKey(websiteUrl);
  if (!host) return;

  const prev = cache.entries[host];
  cache.entries[host] = {
    host,
    failCount: (prev?.failCount ?? 0) + 1,
    lastFailedAt: new Date().toISOString(),
    lastReason: reason,
  };
}

export function recordProbeSuccess(websiteUrl: string, cache: ProbeFailureCacheFile): void {
  const host = websiteHostKey(websiteUrl);
  if (!host) return;
  delete cache.entries[host];
}
