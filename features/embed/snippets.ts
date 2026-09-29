/**
 * Copy-paste code for an embed target (docs/03-architecture/embeds.md). Pure: the builder dialog
 * renders these strings and the preview route loads the loader with the same config objects.
 *
 * Only keys the loader and booking page understand are emitted, and defaults are left out so a
 * snippet stays short. Every value that lands in HTML is escaped for its context: text,
 * double-quoted attribute, JSON inside a single-quoted attribute, or JSON inside a <script>.
 */
import { isValidCalLink } from "./cal-link";
import { DEFAULT_BUTTON_TEXT, type EmbedMode, type EmbedOptions, sanitizeEmbedOptions } from "./options";
import type { EmbedTarget } from "./target";

/** What the code block shows: the loader snippet for the mode, a plain iframe or a bare link. */
export type SnippetFormat = "html" | "iframe" | "link";
export const SNIPPET_FORMATS: readonly SnippetFormat[] = ["html", "iframe", "link"];

/** The loader's `config` / `data-opencalendar-config` object (EMB-004 keys only). */
export type EmbedConfig = {
  theme?: "light" | "dark";
  brand?: string;
  layout?: "week" | "column";
  hideDetails?: true;
  name?: string;
  email?: string;
};

/** Arguments of `OpenCalendar.floatingButton(...)`. */
export type FloatingButtonArgs = {
  calLink: string;
  text?: string;
  color?: string;
  position?: "bottom-left";
  config?: EmbedConfig;
};

export type SnippetInput = {
  /** Instance URL (APP_URL), e.g. "https://cal.example.com". */
  appUrl: string;
  target: Pick<EmbedTarget, "kind" | "calLink" | "label">;
  mode: EmbedMode;
  format: SnippetFormat;
  options: Partial<EmbedOptions>;
};

/** Escapes text content and double-quoted attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON for a single-quoted attribute: `&` first (so entities stay literal), then `'`. */
export function jsonAttribute(value: unknown): string {
  return JSON.stringify(value).replace(/&/g, "&amp;").replace(/'/g, "&#39;");
}

/** JSON that is safe inside an inline <script>: no `</script>`, `<!--` or line separators. */
export function jsonScript(value: unknown, space?: number): string {
  return JSON.stringify(value, null, space)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** "https://cal.example.com/" → "https://cal.example.com"; throws on anything but http(s). */
export function normalizeAppUrl(appUrl: string): string {
  const url = new URL(appUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("appUrl must be http(s)");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function assertCalLink(calLink: string): void {
  if (!isValidCalLink(calLink)) throw new Error(`invalid calLink: ${String(calLink).slice(0, 80)}`);
}

/** Routing forms ignore booking-only options (layout, details column, prefill). */
const isBookingTarget = (target: Pick<EmbedTarget, "kind">) => target.kind !== "form";

/** The loader config for these options, with defaults left out. */
export function embedConfig(target: Pick<EmbedTarget, "kind">, input: Partial<EmbedOptions>): EmbedConfig {
  const o = sanitizeEmbedOptions(input);
  const config: EmbedConfig = {};
  if (o.theme !== "auto") config.theme = o.theme;
  if (o.brand) config.brand = o.brand;
  if (!isBookingTarget(target)) return config;
  if (o.layout !== "month") config.layout = o.layout;
  if (o.hideDetails) config.hideDetails = true;
  if (o.name) config.name = o.name;
  if (o.email) config.email = o.email;
  return config;
}

export function floatingButtonArgs(
  target: Pick<EmbedTarget, "kind" | "calLink">,
  input: Partial<EmbedOptions>,
): FloatingButtonArgs {
  assertCalLink(target.calLink);
  const o = sanitizeEmbedOptions(input);
  const args: FloatingButtonArgs = { calLink: target.calLink };
  if (o.buttonText !== DEFAULT_BUTTON_TEXT) args.text = o.buttonText;
  if (o.buttonColor) args.color = o.buttonColor;
  if (o.buttonPosition === "bottom-left") args.position = "bottom-left";
  const config = embedConfig(target, o);
  if (Object.keys(config).length > 0) args.config = config;
  return args;
}

/**
 * The page URL the loader would frame (mirrors `buildUrl` in public/embed.js): brand without `#`,
 * `true` as "1", and `embed=1` last. Without `embed`, a plain booking link that keeps only the
 * parameters a full page understands (layout and prefill).
 */
export function bookingPageUrl(
  appUrl: string,
  target: Pick<EmbedTarget, "kind" | "calLink">,
  input: Partial<EmbedOptions>,
  embed: boolean,
): string {
  assertCalLink(target.calLink);
  const url = new URL(`${normalizeAppUrl(appUrl)}/${target.calLink}`);
  const config = embedConfig(target, input);
  const keys: (keyof EmbedConfig)[] = embed
    ? ["theme", "brand", "layout", "hideDetails", "name", "email"]
    : ["layout", "name", "email"];
  for (const key of keys) {
    const value = config[key];
    if (value === undefined) continue;
    url.searchParams.set(key, value === true ? "1" : key === "brand" ? String(value).replace(/^#/, "") : String(value));
  }
  if (embed) url.searchParams.set("embed", "1");
  return url.href;
}

const configAttribute = (config: EmbedConfig) =>
  Object.keys(config).length > 0 ? ` data-opencalendar-config='${jsonAttribute(config)}'` : "";

function loaderScript(appUrl: string, async: boolean): string {
  return `<script src="${escapeHtml(`${normalizeAppUrl(appUrl)}/embed.js`)}"${async ? " async" : ""}></script>`;
}

function inlineSnippet({ appUrl, target, options }: SnippetInput): string {
  const o = sanitizeEmbedOptions(options);
  const style = `width:${o.width};height:${o.height}px;overflow:auto`;
  return [
    `<div data-opencalendar-inline="${escapeHtml(target.calLink)}"${configAttribute(embedConfig(target, o))} style="${escapeHtml(style)}"></div>`,
    loaderScript(appUrl, true),
  ].join("\n");
}

function popupSnippet({ appUrl, target, options }: SnippetInput): string {
  const o = sanitizeEmbedOptions(options);
  return [
    `<button type="button" data-opencalendar-link="${escapeHtml(target.calLink)}"${configAttribute(embedConfig(target, o))}>${escapeHtml(o.buttonText)}</button>`,
    loaderScript(appUrl, true),
  ].join("\n");
}

function floatingSnippet({ appUrl, target, options }: SnippetInput): string {
  // The call needs the loader first, so this script tag is neither async nor deferred.
  return [
    loaderScript(appUrl, false),
    "<script>",
    `  OpenCalendar.floatingButton(${jsonScript(floatingButtonArgs(target, options), 2).replace(/\n/g, "\n  ")});`,
    "</script>",
  ].join("\n");
}

function iframeSnippet({ appUrl, target, options }: SnippetInput): string {
  const o = sanitizeEmbedOptions(options);
  const src = bookingPageUrl(appUrl, target, o, true);
  const width = o.width.endsWith("px") ? o.width.slice(0, -2) : o.width;
  return `<iframe src="${escapeHtml(src)}" title="${escapeHtml(target.label)}" width="${escapeHtml(width)}" height="${o.height}" style="border:0" loading="lazy"></iframe>`;
}

/** The code to paste for one target, mode and format. Throws on an invalid calLink or appUrl. */
export function generateSnippet(input: SnippetInput): string {
  assertCalLink(input.target.calLink);
  if (input.format === "link") return bookingPageUrl(input.appUrl, input.target, input.options, false);
  if (input.format === "iframe") return iframeSnippet(input);
  if (input.mode === "floating") return floatingSnippet(input);
  if (input.mode === "popup") return popupSnippet(input);
  return inlineSnippet(input);
}
