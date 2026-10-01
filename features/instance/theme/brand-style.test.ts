import { describe, expect, it } from "vitest";
import { brandStyle } from "./brand-style";

describe("brandStyle", () => {
  it("overrides primary, ring and a readable foreground", () => {
    expect(brandStyle("#1d4ed8")).toEqual({ "--primary": "#1d4ed8", "--primary-foreground": "#ffffff", "--ring": "#1d4ed8" });
    expect(brandStyle("#fde68a")).toMatchObject({ "--primary-foreground": "#0f172a" });
  });

  it("ignores missing or malformed colors", () => {
    expect(brandStyle(null)).toBeUndefined();
    expect(brandStyle(undefined)).toBeUndefined();
    expect(brandStyle("#abc")).toBeUndefined();
    expect(brandStyle("red")).toBeUndefined();
  });
});
