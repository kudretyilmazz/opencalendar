import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "./ttl-cache";

describe("TtlCache", () => {
  it("serves hits until the TTL expires and shares concurrent loads", async () => {
    let now = 0;
    const cache = new TtlCache<number>(1000, 10, () => now);
    const load = vi.fn(async () => 42);
    expect(await Promise.all([cache.get("k", load), cache.get("k", load)])).toEqual([42, 42]);
    expect(load).toHaveBeenCalledTimes(1);
    now = 999;
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(1);
    now = 1000;
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures and bounds its size", async () => {
    const cache = new TtlCache<number>(1000, 2);
    await expect(cache.get("bad", async () => Promise.reject(new Error("x")))).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(await cache.get("bad", async () => 1)).toBe(1);
    await cache.get("a", async () => 2);
    await cache.get("b", async () => 3); // exceeds 2 → cleared, then stored
    expect(await cache.get("a", async () => 9)).toBe(9);
  });
});
