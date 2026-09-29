import { isValidTimeZone, parseDate, wallToUtc } from "@/lib/availability/tz";
import { type FormatPrefs, formatDuration, formatTime, formatWeekdayDate, timeZoneLabel } from "@/lib/format";
import type { EmbedTarget } from "../target";

/**
 * Email embed (Cal.com-style): the sender picks a few free slots and pastes a snapshot of them
 * into an email. Each slot is a link that opens the booking page on that start
 * (`?date=…&slot=…&duration=…`, see `BOOKING_LINK_PARAMS`). No tokens ever go into the email.
 *
 * The HTML is written for mail clients, not browsers: tables for layout, inline styles only,
 * no `<style>`, classes, scripts, images or web fonts, and explicit background + text colors on
 * everything so dark-mode color inversion keeps contrast.
 */

/** Most slots one email carries; more than this is a wall of buttons nobody reads. */
export const MAX_EMAIL_SLOTS = 10;

/** Accepted calLink shapes; mirrors `buildUrl` in public/embed.js. */
const CAL_LINK = /^(team\/[\w-]+(\/[\w-]+)?|forms\/[\w-]+|[\w-]+(\+[\w-]+)*(\/[\w-]+)?)$/;

export type EmailEmbedDay = { date: string; slots: readonly string[] };

export type EmailEmbedInput = {
  appUrl: string;
  target: Pick<EmbedTarget, "calLink" | "label">;
  duration: number;
  timeZone: string;
  locale: string;
  hour12: boolean;
  days: readonly EmailEmbedDay[];
  /** Replaces the event type label in the heading. */
  title?: string;
  /** Short message above the times (plain text; line breaks are kept). */
  note?: string;
  /** Defaults to MAX_EMAIL_SLOTS. */
  maxSlots?: number;
};

export type EmailEmbed = { html: string; text: string };

export class EmailEmbedError extends Error {}

const STRINGS = {
  en: {
    timeZone: (tz: string) => `Times are shown in ${tz}.`,
    pick: "Pick a time that works for you:",
    seeAll: "See all available times",
    noTimes: "No times selected.",
  },
  tr: {
    timeZone: (tz: string) => `Saatler ${tz} saat dilimindedir.`,
    pick: "Size uygun bir saat seçin:",
    seeAll: "Tüm uygun saatleri gör",
    noTimes: "Saat seçilmedi.",
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

const COLORS = {
  text: "#18181b",
  muted: "#52525b",
  border: "#e4e4e7",
  card: "#ffffff",
  button: "#f4f4f5",
  buttonBorder: "#d4d4d8",
  link: "#1d4ed8",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escapes text for HTML element content and double- or single-quoted attributes. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function canonicalLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? "en";
  } catch {
    return "en";
  }
}

function stringsFor(locale: string): Strings {
  const language = locale.split("-")[0]?.toLowerCase();
  return language === "tr" ? STRINGS.tr : STRINGS.en;
}

/** Instance base URL without a trailing slash; only http(s), never credentials, query or hash. */
export function normalizeAppUrl(appUrl: string): string {
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    throw new EmailEmbedError("appUrl must be an absolute URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new EmailEmbedError("appUrl must use http or https");
  if (url.username || url.password) throw new EmailEmbedError("appUrl must not contain credentials");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** Path of the booking page, each part URL-encoded ("+" of dynamic groups kept literal). */
export function bookingPath(calLink: string): string {
  const path = calLink.replace(/^\/+|\/+$/g, "");
  if (!CAL_LINK.test(path)) throw new EmailEmbedError("Invalid calLink");
  return path
    .split("/")
    .map((segment) => segment.split("+").map(encodeURIComponent).join("+"))
    .join("/");
}

export function slotUrl(base: string, path: string, date: string, slot: string, duration: number): string {
  const query = [`date=${encodeURIComponent(date)}`, `slot=${encodeURIComponent(slot)}`, `duration=${encodeURIComponent(String(duration))}`];
  return `${base}/${path}?${query.join("&")}`;
}

/** Valid days in date order, each with its valid, de-duplicated, sorted slots; the total is capped. */
export function normalizeDays(days: readonly EmailEmbedDay[], maxSlots: number): { date: string; slots: { iso: string; ms: number }[] }[] {
  const byDate = new Map<string, Map<number, string>>();
  for (const day of days) {
    try {
      parseDate(day.date);
    } catch {
      continue;
    }
    const slots = byDate.get(day.date) ?? new Map<number, string>();
    for (const slot of day.slots) {
      const ms = Date.parse(slot);
      if (Number.isFinite(ms)) slots.set(ms, new Date(ms).toISOString());
    }
    byDate.set(day.date, slots);
  }
  let left = Math.max(0, Math.floor(maxSlots));
  const result: { date: string; slots: { iso: string; ms: number }[] }[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const slots = [...byDate.get(date)!.entries()]
      .sort(([a], [b]) => a - b)
      .slice(0, left)
      .map(([ms, iso]) => ({ ms, iso }));
    left -= slots.length;
    if (slots.length > 0) result.push({ date, slots });
  }
  return result;
}

type Model = {
  heading: string;
  subtitle: string;
  timeZoneLine: string;
  note: string | null;
  strings: Strings;
  allUrl: string;
  days: { label: string; slots: { label: string; url: string }[] }[];
};

function buildModel(input: EmailEmbedInput): Model {
  if (!isValidTimeZone(input.timeZone)) throw new EmailEmbedError("Unknown time zone");
  if (!Number.isInteger(input.duration) || input.duration <= 0) throw new EmailEmbedError("Invalid duration");
  const base = normalizeAppUrl(input.appUrl);
  const path = bookingPath(input.target.calLink);
  const locale = canonicalLocale(input.locale);
  const strings = stringsFor(locale);
  const prefs: FormatPrefs = { locale, timeZone: input.timeZone, hour12: input.hour12 };
  const days = normalizeDays(input.days, input.maxSlots ?? MAX_EMAIL_SLOTS);
  const firstInstant = days[0]?.slots[0]?.ms ?? 0;
  const note = input.note?.trim();
  return {
    heading: input.title?.trim() || input.target.label,
    subtitle: formatDuration(input.duration, locale),
    timeZoneLine: strings.timeZone(timeZoneLabel(input.timeZone, firstInstant, locale)),
    note: note || null,
    strings,
    allUrl: `${base}/${path}?duration=${encodeURIComponent(String(input.duration))}`,
    days: days.map((day) => ({
      // Noon UTC of that calendar date, formatted in UTC: the weekday and date never shift.
      label: formatWeekdayDate(wallToUtc(parseDate(day.date), 12 * 60, "UTC"), { ...prefs, timeZone: "UTC" }),
      slots: day.slots.map((slot) => ({ label: formatTime(slot.ms, prefs), url: slotUrl(base, path, day.date, slot.iso, input.duration) })),
    })),
  };
}

const LINK_ATTRS = 'target="_blank" rel="noopener noreferrer"';

function slotButton(slot: { label: string; url: string }): string {
  const label = escapeHtml(slot.label);
  return (
    `<table role="presentation" align="left" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 8px 8px 0;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td bgcolor="${COLORS.button}" style="background-color:${COLORS.button};border:1px solid ${COLORS.buttonBorder};border-radius:6px;padding:8px 14px;">` +
    `<a href="${escapeHtml(slot.url)}" ${LINK_ATTRS} style="color:${COLORS.text};font-family:${FONT};font-size:14px;font-weight:600;line-height:20px;text-decoration:none;display:inline-block;">${label}</a>` +
    `</td></tr></table></td></tr></table>`
  );
}

function dayBlock(day: Model["days"][number]): string {
  return (
    `<tr><td style="padding:16px 24px 0 24px;">` +
    `<p style="margin:0 0 8px 0;color:${COLORS.text};font-family:${FONT};font-size:14px;font-weight:600;line-height:20px;">${escapeHtml(day.label)}</p>` +
    day.slots.map(slotButton).join("") +
    `</td></tr>`
  );
}

function paragraph(text: string, style: string): string {
  const lines = text.split(/\r?\n/).map(escapeHtml).join("<br>");
  return `<p style="margin:0;font-family:${FONT};${style}">${lines}</p>`;
}

function renderHtml(model: Model): string {
  const body = model.days.length
    ? model.days.map(dayBlock).join("")
    : `<tr><td style="padding:16px 24px 0 24px;">${paragraph(model.strings.noTimes, `color:${COLORS.muted};font-size:14px;line-height:20px;`)}</td></tr>`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;">` +
    `<tr><td bgcolor="${COLORS.card}" style="background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:8px;padding:0 0 20px 0;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td style="padding:20px 24px 0 24px;">` +
    paragraph(model.heading, `color:${COLORS.text};font-size:18px;font-weight:600;line-height:26px;`) +
    paragraph(model.subtitle, `color:${COLORS.muted};font-size:14px;line-height:20px;`) +
    `</td></tr>` +
    (model.note ? `<tr><td style="padding:12px 24px 0 24px;">${paragraph(model.note, `color:${COLORS.text};font-size:14px;line-height:20px;`)}</td></tr>` : "") +
    `<tr><td style="padding:12px 24px 0 24px;">` +
    paragraph(model.strings.pick, `color:${COLORS.text};font-size:14px;line-height:20px;`) +
    paragraph(model.timeZoneLine, `color:${COLORS.muted};font-size:13px;line-height:18px;`) +
    `</td></tr>` +
    body +
    `<tr><td style="padding:12px 24px 0 24px;">` +
    `<a href="${escapeHtml(model.allUrl)}" ${LINK_ATTRS} style="color:${COLORS.link};font-family:${FONT};font-size:14px;line-height:20px;text-decoration:underline;">${escapeHtml(model.strings.seeAll)}</a>` +
    `</td></tr>` +
    `</table></td></tr></table>`
  );
}

function renderText(model: Model): string {
  const lines = [`${model.heading} (${model.subtitle})`];
  if (model.note) lines.push("", model.note);
  lines.push("", model.strings.pick, model.timeZoneLine);
  if (model.days.length === 0) lines.push("", model.strings.noTimes);
  for (const day of model.days) {
    lines.push("", day.label);
    for (const slot of day.slots) lines.push(`- ${slot.label}: ${slot.url}`);
  }
  lines.push("", `${model.strings.seeAll}: ${model.allUrl}`);
  return lines.join("\n");
}

/**
 * Renders the email snippet (an HTML fragment to paste into an email body) and its plain-text
 * alternative. Throws EmailEmbedError for an invalid appUrl, calLink, time zone or duration;
 * drops malformed dates and slots, empty days and slots beyond `maxSlots`.
 */
export function renderEmailEmbed(input: EmailEmbedInput): EmailEmbed {
  const model = buildModel(input);
  return { html: renderHtml(model), text: renderText(model) };
}

/** Wraps the fragment in a minimal document for a sandboxed preview iframe. */
export function emailPreviewDocument(html: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:16px;background-color:#fafafa;">${html}</body></html>`
  );
}
