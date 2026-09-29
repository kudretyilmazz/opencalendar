/**
 * Embed builder options: their defaults, the allow-lists that validate them and the query-string
 * form the preview route reads. Pure, so the dialog, the snippets and the preview share one
 * definition. Values outside the allow-lists fall back to the default, never through to HTML.
 */
import { isValidCalLink } from "./cal-link";
import { BOOKING_LAYOUTS, type BookingLayout } from "./target";

export type EmbedTheme = "auto" | "light" | "dark";
export const EMBED_THEMES: readonly EmbedTheme[] = ["auto", "light", "dark"];

export type FloatingPosition = "bottom-right" | "bottom-left";
export const FLOATING_POSITIONS: readonly FloatingPosition[] = ["bottom-right", "bottom-left"];

/** How the loader shows the booking page on the host site. */
export type EmbedMode = "inline" | "floating" | "popup";
export const EMBED_MODES: readonly EmbedMode[] = ["inline", "floating", "popup"];

export type EmbedOptions = {
  theme: EmbedTheme;
  /** "#rrggbb" or null for the instance default. */
  brand: string | null;
  layout: BookingLayout;
  hideDetails: boolean;
  /** Prefill for the booking form; empty means none. */
  name: string;
  email: string;
  /** Inline container size: width "100%" or "<n>px", height in px. */
  width: string;
  height: number;
  /** Floating button and popup trigger. */
  buttonText: string;
  /** "#rrggbb" or null for the loader default. */
  buttonColor: string | null;
  buttonPosition: FloatingPosition;
};

export const DEFAULT_BUTTON_TEXT = "Book a meeting";
export const MIN_HEIGHT = 300;
export const MAX_HEIGHT = 2000;
export const MAX_TEXT_LENGTH = 60;
export const MAX_PREFILL_LENGTH = 120;

export const DEFAULT_EMBED_OPTIONS: EmbedOptions = {
  theme: "auto",
  brand: null,
  layout: "month",
  hideDetails: false,
  name: "",
  email: "",
  width: "100%",
  height: 640,
  buttonText: DEFAULT_BUTTON_TEXT,
  buttonColor: null,
  buttonPosition: "bottom-right",
};

const HEX = /^#?([0-9a-f]{6})$/i;
const WIDTH = /^(?:(100|[1-9]\d?)%|([1-9]\d{1,3})px)$/;
// Deliberately loose (the booking form validates for real): one @, no spaces or markup.
const EMAIL = /^[^\s@<>"'`]+@[^\s@<>"'`]+$/;

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** "#0F766E", "0f766e" → "#0f766e"; anything else (3-digit, names, junk) → null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = HEX.exec(value.trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

/** "1%"…"100%" or "10px"…"9999px"; anything else → null. */
export function normalizeWidth(value: unknown): string | null {
  return typeof value === "string" && WIDTH.test(value.trim()) ? value.trim() : null;
}

export function clampHeight(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_EMBED_OPTIONS.height;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(n)));
}

/** Trims, drops control characters and caps the length of free text. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

export function cleanEmail(value: unknown): string {
  const email = cleanText(value, MAX_PREFILL_LENGTH);
  return EMAIL.test(email) ? email : "";
}

/** Validates a partial, untrusted set of options against the allow-lists; unknown keys are dropped. */
export function sanitizeEmbedOptions(input: Partial<Record<keyof EmbedOptions, unknown>>): EmbedOptions {
  const d = DEFAULT_EMBED_OPTIONS;
  return {
    theme: oneOf(EMBED_THEMES, input.theme, d.theme),
    brand: normalizeHex(input.brand),
    layout: oneOf(BOOKING_LAYOUTS, input.layout, d.layout),
    hideDetails: input.hideDetails === true || input.hideDetails === "1" || input.hideDetails === "true",
    name: cleanText(input.name, MAX_PREFILL_LENGTH),
    email: cleanEmail(input.email),
    width: normalizeWidth(input.width) ?? d.width,
    height: input.height === undefined ? d.height : clampHeight(input.height),
    buttonText: cleanText(input.buttonText, MAX_TEXT_LENGTH) || d.buttonText,
    buttonColor: normalizeHex(input.buttonColor),
    buttonPosition: oneOf(FLOATING_POSITIONS, input.buttonPosition, d.buttonPosition),
  };
}

/** Query parameter names used by the preview route. */
const QUERY_KEYS: Record<keyof EmbedOptions, string> = {
  theme: "theme",
  brand: "brand",
  layout: "layout",
  hideDetails: "hideDetails",
  name: "name",
  email: "email",
  width: "width",
  height: "height",
  buttonText: "text",
  buttonColor: "color",
  buttonPosition: "position",
};

export type PreviewParams = { calLink: string; mode: EmbedMode; options: EmbedOptions };

/** Path of the preview route (framed by the embed builder; see lib/security/csp.ts). */
export const EMBED_PREVIEW_PATH = "/embed/preview";

/**
 * The preview route's relative URL for these settings. Only non-default options are written.
 * `embed=1` keeps next.config.ts from adding `X-Frame-Options: DENY`, so the same-origin
 * dashboard can frame the page (the CSP allows only 'self' for this path).
 */
export function previewUrl({ calLink, mode, options }: PreviewParams): string {
  const params = new URLSearchParams({ calLink, mode });
  const clean = sanitizeEmbedOptions(options);
  for (const key of Object.keys(QUERY_KEYS) as (keyof EmbedOptions)[]) {
    const value = clean[key];
    if (value === DEFAULT_EMBED_OPTIONS[key] || value === null || value === "" || value === false) continue;
    params.set(QUERY_KEYS[key], value === true ? "1" : String(value));
  }
  params.set("embed", "1");
  return `${EMBED_PREVIEW_PATH}?${params.toString()}`;
}

type SearchParams = Record<string, string | string[] | undefined>;

/** Parses the preview route's query; null when calLink or mode is not allowed. */
export function parsePreviewParams(searchParams: SearchParams): PreviewParams | null {
  const one = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const calLink = one("calLink");
  const mode = one("mode");
  if (!isValidCalLink(calLink) || !EMBED_MODES.includes(mode as EmbedMode)) return null;
  const raw: Partial<Record<keyof EmbedOptions, unknown>> = {};
  for (const key of Object.keys(QUERY_KEYS) as (keyof EmbedOptions)[]) {
    const value = one(QUERY_KEYS[key]);
    if (value !== undefined) raw[key] = value;
  }
  return { calLink, mode: mode as EmbedMode, options: sanitizeEmbedOptions(raw) };
}
