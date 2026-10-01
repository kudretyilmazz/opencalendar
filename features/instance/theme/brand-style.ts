import type { CSSProperties } from "react";
import { HEX_COLOR, readableForeground } from "./contrast";

/**
 * Inline token overrides for a page-level brand color (embed `brand`, team brand color). Wins
 * over the instance theme; the text color is derived so light brand colors stay readable.
 */
export function brandStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color || !HEX_COLOR.test(color)) return undefined;
  return { "--primary": color, "--primary-foreground": readableForeground(color), "--ring": color } as CSSProperties;
}
