type Bucket = {
  count: number;
  resetAt: number;
  lastSeenAt: number;
};

const RATE_LIMIT_STORE_SYMBOL = Symbol.for("foodnearme.rate_limit_store");

function getStore(): Map<string, Bucket> {
  const globalObject = globalThis as typeof globalThis & {
    [RATE_LIMIT_STORE_SYMBOL]?: Map<string, Bucket>;
  };

  if (!globalObject[RATE_LIMIT_STORE_SYMBOL]) {
    globalObject[RATE_LIMIT_STORE_SYMBOL] = new Map<string, Bucket>();
  }

  return globalObject[RATE_LIMIT_STORE_SYMBOL];
}

export function checkRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const { key, limit, windowMs } = options;
  const now = Date.now();
  const store = getStore();
  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs,
      lastSeenAt: now,
    });

    return { allowed: true, remaining: limit - 1 };
  }

  existing.count += 1;
  existing.lastSeenAt = now;
  store.set(key, existing);

  if (existing.count > limit) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: limit - existing.count };
}

export function checkMinInterval(options: {
  key: string;
  minIntervalMs: number;
}) {
  const { key, minIntervalMs } = options;
  const now = Date.now();
  const store = getStore();
  const existing = store.get(key);

  if (!existing) {
    store.set(key, {
      count: 1,
      resetAt: now + minIntervalMs,
      lastSeenAt: now,
    });
    return { allowed: true };
  }

  if (now - existing.lastSeenAt < minIntervalMs) {
    return { allowed: false };
  }

  existing.lastSeenAt = now;
  store.set(key, existing);
  return { allowed: true };
}
