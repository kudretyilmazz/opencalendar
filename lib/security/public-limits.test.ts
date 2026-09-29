import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getEnv: () => ({ TRUSTED_PROXIES: ["10.0.0.0/8", "127.0.0.1/32"] }) }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));

const { clientIp, overLocalLimit, PUBLIC_LIMITS } = await import("./public-limits");

const h = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

describe("clientIp", () => {
  it("uses the right-most untrusted hop, so a spoofed left-most value is ignored", () => {
    expect(clientIp(h("1.2.3.4, 203.0.113.9, 10.0.0.2"))).toBe("203.0.113.9");
  });

  it("keys on the nearest hop when every hop is trusted, and 'unknown' without a header", () => {
    expect(clientIp(h("10.0.0.2"))).toBe("10.0.0.2");
    expect(clientIp(h())).toBe("unknown");
  });
});

describe("overLocalLimit", () => {
  it("allows up to the limit per window, then blocks until the window resets", () => {
    const { max, windowMs } = PUBLIC_LIMITS.slots;
    const results = Array.from({ length: max + 1 }, () => overLocalLimit("slots", "203.0.113.5", 1000));
    expect(results.slice(0, max).every((r) => r === false)).toBe(true);
    expect(results[max]).toBe(true);
    expect(overLocalLimit("slots", "203.0.113.6", 1000)).toBe(false); // other clients unaffected
    expect(overLocalLimit("slots", "203.0.113.5", 1000 + windowMs)).toBe(false);
  });
});
