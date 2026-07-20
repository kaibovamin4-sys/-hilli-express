// TTL cache for external API responses.
// Prevents hammering Open-Meteo when many clients poll /api/status.

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;
  try {
    const value = await fn();
    store.set(key, { value, expiresAt: now + ttlMs });
    return value;
  } catch (err) {
    // On failure prefer stale data over hard-erroring the request.
    if (hit) return hit.value;
    throw err;
  }
}

export function invalidate(key: string): void {
  store.delete(key);
}

export function clearAll(): void {
  store.clear();
}
