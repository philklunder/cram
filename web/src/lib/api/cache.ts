"use client";

// A tiny in-memory read cache for the backend list endpoints.
//
// Every page mounts its own `useAsync` loader, so navigating Dashboard → Review → Progress used to
// re-pull the same tables once per page. The reads all funnel through `pageAll` in ./client, so
// caching there dedupes both concurrent callers (one in-flight request is shared) and sequential
// ones (a settled result is reused for TTL_MS).
//
// Correctness rests on two rules, both enforced in ./client:
//   1. every mutation invalidates the resources it can change, so a post-mutation `reload()` refetches;
//   2. sign-out calls `clearApiCache()`, so a second user in the same tab never reads the first's rows.

// How long a settled result stays fresh. Long enough to cover a burst of navigation, short enough
// that a change made on another device (or iOS) shows up without a hard reload.
const TTL_MS = 60_000;

interface CacheEntry {
  promise: Promise<unknown>;
  // null while the request is in flight; a timestamp once it resolved.
  settledAt: number | null;
}

const store = new Map<string, CacheEntry>();

// Share an in-flight request, and reuse a settled one until it goes stale. A rejected request is
// evicted so the next caller retries rather than being handed the same failure forever.
export function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && (hit.settledAt === null || Date.now() - hit.settledAt < TTL_MS)) {
    return hit.promise as Promise<T>;
  }

  const entry: CacheEntry = { promise: undefined as unknown as Promise<unknown>, settledAt: null };
  entry.promise = fetcher().then(
    (value) => {
      entry.settledAt = Date.now();
      return value;
    },
    (err: unknown) => {
      // Only evict our own entry — an invalidate() + refetch may have replaced it while we were
      // in flight, and dropping that newer entry would silently un-cache a good result.
      if (store.get(key) === entry) store.delete(key);
      throw err;
    },
  );
  store.set(key, entry);
  return entry.promise as Promise<T>;
}

// Drop specific resources after a write that could have changed them.
export function invalidate(...keys: string[]): void {
  for (const key of keys) store.delete(key);
}

// Drop everything. Used on sign-out, and after /v1/generate (which writes across five resources).
export function clearApiCache(): void {
  store.clear();
}
