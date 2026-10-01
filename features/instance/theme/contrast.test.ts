import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contrastRatio, readableForeground, relativeLuminance, TEXT_CONTRAST } from "./contrast";

const hexColor = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, "0")}`);

describe("contrast helpers", () => {
  it("matches the WCAG reference values", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#4f46e5", "#fafafa")).toBe(contrastRatio("#fafafa", "#4f46e5"));
  });

  it("rejects anything that is not #rrggbb", () => {
    expect(() => relativeLuminance("red")).toThrow();
    expect(() => relativeLuminance("#fff")).toThrow();
    expect(() => relativeLuminance("#12345g")).toThrow();
  });

  it("picks white on dark and dark on light colors", () => {
    expect(readableForeground("#111827")).toBe("#ffffff");
    expect(readableForeground("#fde68a")).toBe("#0f172a");
  });

  it("always yields readable text, whatever the brand color", () => {
    fc.assert(
      fc.property(hexColor, (color) => {
        expect(contrastRatio(color, readableForeground(color))).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      }),
    );
  });
});
