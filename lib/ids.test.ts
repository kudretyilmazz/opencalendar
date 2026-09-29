import { describe, expect, it } from "vitest";
import { hashToken, randomToken, tokenMatches } from "./ids";

describe("tokens (BKG-011)", () => {
  it("generates at least 128 bits of URL-safe randomness", () => {
    const uid = randomToken(16);
    expect(uid).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(Array.from({ length: 1000 }, () => randomToken(16))).size).toBe(1000);
  });

  it("matches only the token that produced the hash", () => {
    const token = randomToken();
    const hash = hashToken(token);
    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches(`${token}x`, hash)).toBe(false);
    expect(tokenMatches(null, hash)).toBe(false);
    expect(tokenMatches("", hash)).toBe(false);
    expect(tokenMatches("x".repeat(1000), hash)).toBe(false);
  });
});
