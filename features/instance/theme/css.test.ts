import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { contrastRatio, TEXT_CONTRAST } from "./contrast";
import { BACKGROUNDS, textShade, themeCss } from "./css";

const hexColor = fc.integer({ min: 0, max: 0xffffff }).map((n) => `#${n.toString(16).padStart(6, "0")}`);

describe("themeCss", () => {
  it("is empty for an uncustomized instance", () => {
    expect(themeCss({}, null)).toBe("");
  });

  it("overrides primary, its foreground and the focus ring per scheme", () => {
    const css = themeCss({ light: { primary: "#1d4ed8" }, dark: { primary: "#fde68a" } }, null);
    expect(css).toContain(":root:not(.dark){--primary:#1d4ed8;--primary-foreground:#ffffff;--ring:#1d4ed8}");
    expect(css).toContain(":root.dark{--primary:#fde68a;--primary-foreground:#0f172a;--ring:#fde68a}");
  });

  it("derives the highlight family from one color", () => {
    const css = themeCss({ light: { highlight: "#0d9488" } }, null);
    expect(css).toMatch(/--highlight:#0d9488;--highlight-foreground:#[0-9a-f]{6};--highlight-text:#[0-9a-f]{6}/);
    expect(css).toContain("--highlight-soft:color-mix(in srgb, #0d9488 12%, var(--background))");
  });

  it("applies the radius to both schemes", () => {
    const css = themeCss({}, "1rem");
    expect(css).toContain(":root:not(.dark){--radius:1rem}");
    expect(css).toContain(":root.dark{--radius:1rem}");
  });

  it("never lets a non-hex value into the stylesheet", () => {
    const css = themeCss({ light: { primary: "red;}body{display:none", highlight: "#123" } }, null);
    expect(css).toBe("");
  });
});

describe("textShade", () => {
  it("keeps a color that already reads on the background", () => {
    expect(textShade("#4f46e5", BACKGROUNDS.light)).toBe("#4f46e5");
  });

  it("always reaches text contrast on both backgrounds", () => {
    fc.assert(
      fc.property(hexColor, fc.constantFrom(BACKGROUNDS.light, BACKGROUNDS.dark), (color, background) => {
        expect(contrastRatio(textShade(color, background), background)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      }),
    );
  });
});
