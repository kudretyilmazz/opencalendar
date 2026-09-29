import { describe, expect, it } from "vitest";
import { initials, zoneClock } from "./display";

describe("initials", () => {
  it("takes the first letters of the first and last word", () => {
    expect(initials("Erin Example")).toBe("EE");
    expect(initials("  ada   king lovelace ")).toBe("AL");
  });

  it("handles single words and empty names", () => {
    expect(initials("cher")).toBe("C");
    expect(initials("   ")).toBe("?");
  });
});

describe("zoneClock", () => {
  const now = new Date("2026-09-29T18:30:00Z");

  it("shows the offset and the 24-hour wall time", () => {
    expect(zoneClock("Europe/Istanbul", now, false)).toBe("GMT+3 · 21:30 now");
  });

  it("shows 12-hour time when asked", () => {
    expect(zoneClock("Europe/Istanbul", now, true)).toBe("GMT+3 · 9:30 PM now");
  });

  it("handles UTC and half-hour offsets", () => {
    expect(zoneClock("UTC", now, false)).toMatch(/^GMT(\+0)? · 18:30 now$/);
    expect(zoneClock("Asia/Kolkata", now, false)).toBe("GMT+5:30 · 00:00 now");
  });

  it("returns an empty string for an unknown zone", () => {
    expect(zoneClock("Not/AZone", now, false)).toBe("");
  });
});
