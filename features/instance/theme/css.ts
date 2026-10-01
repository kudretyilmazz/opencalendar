import type { InstanceTheme, ThemePalette } from "@/db/schema";
import type { Radius } from "../defaults";
import { contrastRatio, HEX_COLOR, readableForeground, TEXT_CONTRAST } from "./contrast";

/** Page backgrounds from app/globals.css; brand colors are checked against these. */
export const BACKGROUNDS = { light: "#fafafa", dark: "#0b0f17" } as const;
export type Scheme = keyof typeof BACKGROUNDS;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function mix(color: string, toward: string, amount: number): string {
  const a = hexToRgb(color);
  const b = hexToRgb(toward);
  return `#${a.map((c, i) => Math.round(c + (b[i] - c) * amount).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The brand color itself when it reads as text on `background`; otherwise the closest shade
 * (mixed toward black or white) that does. Used for links and accents drawn as text.
 */
export function textShade(color: string, background: string): string {
  const toward = readableForeground(background) === "#ffffff" ? "#ffffff" : "#000000";
  for (let step = 0; step <= 10; step++) {
    const shade = mix(color, toward, step / 10);
    if (contrastRatio(shade, background) >= TEXT_CONTRAST) return shade;
  }
  return toward;
}

function paletteVars(palette: ThemePalette, scheme: Scheme): string[] {
  const vars: string[] = [];
  const { primary, highlight } = palette;
  // Only #rrggbb strings ever reach the stylesheet: anything else is dropped, so a bad row can
  // never inject CSS even if it bypassed validation.
  if (primary && HEX_COLOR.test(primary)) {
    vars.push(`--primary:${primary}`, `--primary-foreground:${readableForeground(primary)}`, `--ring:${primary}`);
  }
  if (highlight && HEX_COLOR.test(highlight)) {
    vars.push(
      `--highlight:${highlight}`,
      `--highlight-foreground:${readableForeground(highlight)}`,
      `--highlight-text:${textShade(highlight, BACKGROUNDS[scheme])}`,
      `--highlight-soft:color-mix(in srgb, ${highlight} 12%, var(--background))`,
      `--highlight-border:color-mix(in srgb, ${highlight} 35%, var(--background))`,
    );
  }
  return vars;
}

/**
 * Instance theme as a stylesheet overriding the globals.css tokens. The doubled selectors beat
 * globals.css regardless of stylesheet order, while inline brand colors on booking pages (team,
 * user, embed `brand`) still win over both.
 */
export function themeCss(theme: InstanceTheme, radius: Radius | null): string {
  const light = [...paletteVars(theme.light ?? {}, "light"), ...(radius ? [`--radius:${radius}`] : [])];
  const dark = paletteVars(theme.dark ?? {}, "dark");
  const rules: string[] = [];
  if (light.length) rules.push(`:root:not(.dark){${light.join(";")}}`);
  if (radius) rules.push(`:root.dark{--radius:${radius}}`);
  if (dark.length) rules.push(`:root.dark{${dark.join(";")}}`);
  return rules.join("\n");
}
