import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cached, clearApiCache, invalidate } from "./cache";

// `store` is module-level, so every test starts from a clean slate.
beforeEach(() => clearApiCache());
afterEach(() => vi.useRealTimers());

// A promise whose settlement we drive by hand, so we can assert on in-flight behaviour.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("cached", () => {
  it("shares one in-flight request between concurrent callers", async () => {
    const d = deferred<string[]>();
    const fetcher = vi.fn(() => d.promise);

    const a = cached("cards", fetcher);
    const b = cached("cards", fetcher);
    d.resolve(["x"]);

    expect(await a).toEqual(["x"]);
    expect(await b).toEqual(["x"]);
    // The whole point: the dashboard's nine parallel pulls must not become nine of each.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reuses a settled result until the TTL expires", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => ["x"]);

    await cached("cards", fetcher);
    vi.advanceTimersByTime(59_000);
    await cached("cards", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Past 60s the entry is stale and the next reader refetches.
    vi.advanceTimersByTime(2_000);
    await cached("cards", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keys entries independently", async () => {
    const cards = vi.fn(async () => ["card"]);
    const exams = vi.fn(async () => ["exam"]);

    expect(await cached("cards", cards)).toEqual(["card"]);
    expect(await cached("exams", exams)).toEqual(["exam"]);
    expect(await cached("cards", cards)).toEqual(["card"]);
    expect(cards).toHaveBeenCalledTimes(1);
  });
});

describe("invalidation", () => {
  it("invalidate() forces the next read to refetch, leaving other keys cached", async () => {
    const cards = vi.fn(async () => ["card"]);
    const exams = vi.fn(async () => ["exam"]);
    await cached("cards", cards);
    await cached("exams", exams);

    invalidate("cards");
    await cached("cards", cards);
    await cached("exams", exams);

    expect(cards).toHaveBeenCalledTimes(2);
    expect(exams).toHaveBeenCalledTimes(1);
  });

  it("clearApiCache() drops every key", async () => {
    const cards = vi.fn(async () => ["card"]);
    const exams = vi.fn(async () => ["exam"]);
    await cached("cards", cards);
    await cached("exams", exams);

    clearApiCache();
    await cached("cards", cards);
    await cached("exams", exams);

    expect(cards).toHaveBeenCalledTimes(2);
    expect(exams).toHaveBeenCalledTimes(2);
  });
});

describe("failures", () => {
  it("evicts a rejected request so the next caller retries", async () => {
    const failing = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(cached("cards", failing)).rejects.toThrow("boom");

    const ok = vi.fn(async () => ["card"]);
    expect(await cached("cards", ok)).toEqual(["card"]);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("a late rejection does not evict the newer entry that replaced it", async () => {
    // Regression guard: the failure handler must only delete its *own* entry. Otherwise an
    // invalidate()+refetch that lands while a doomed request is still in flight gets silently
    // un-cached when that request finally rejects.
    const slow = deferred<string[]>();
    const doomed = cached("cards", () => slow.promise);
    doomed.catch(() => {}); // we assert on it below; don't trip unhandled-rejection

    invalidate("cards");
    const fresh = vi.fn(async () => ["fresh"]);
    expect(await cached("cards", fresh)).toEqual(["fresh"]);

    slow.reject(new Error("boom"));
    await expect(doomed).rejects.toThrow("boom");

    const spy = vi.fn(async () => ["refetched"]);
    expect(await cached("cards", spy)).toEqual(["fresh"]);
    expect(spy).not.toHaveBeenCalled();
  });
});
