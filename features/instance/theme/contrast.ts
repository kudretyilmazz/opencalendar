/** WCAG 2.x relative luminance and contrast helpers for brand colors (NFR-008). */

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Minimum contrast for text (WCAG 1.4.3 AA) and for UI components such as buttons (1.4.11). */
export const TEXT_CONTRAST = 4.5;
export const UI_CONTRAST = 3;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) throw new Error(`Not a #rrggbb color: ${hex}`);
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 0xff) + 0.7152 * channel((n >> 8) & 0xff) + 0.0722 * channel(n & 0xff);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text color for content placed on `background`: white, or the app's slate ink on light colors.
 * Mid-tones where slate falls short get pure black: either white or black always reaches 4.5:1
 * (the worst case is about 4.58:1), so any brand color yields readable button text.
 */
export function readableForeground(background: string): "#ffffff" | "#0f172a" | "#000000" {
  if (contrastRatio(background, "#ffffff") >= TEXT_CONTRAST) return "#ffffff";
  return contrastRatio(background, "#0f172a") >= TEXT_CONTRAST ? "#0f172a" : "#000000";
}
