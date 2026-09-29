/**
 * Date/time formatting for users (I18N-001): always Intl, always an explicit time zone,
 * locale and 12/24h preference. Never uses the server's local time zone.
 */

export type FormatPrefs = { locale: string; timeZone: string; hour12: boolean };

const cache = new Map<string, Intl.DateTimeFormat>();

function dtf(prefs: FormatPrefs, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify([prefs, options]);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(prefs.locale, { timeZone: prefs.timeZone, hour12: prefs.hour12, ...options });
    cache.set(key, f);
  }
  return f;
}

export const formatTime = (ms: number, prefs: FormatPrefs) => dtf(prefs, { hour: "numeric", minute: "2-digit" }).format(ms);

export const formatDateLong = (ms: number, prefs: FormatPrefs) =>
  dtf(prefs, { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(ms);

/** "Tuesday, 29 September" (order and words follow the locale). */
export const formatWeekdayDate = (ms: number, prefs: FormatPrefs) => dtf(prefs, { weekday: "long", day: "numeric", month: "long" }).format(ms);

/** "Tue, 29 Sep" (order and words follow the locale). */
export const formatShortDate = (ms: number, prefs: FormatPrefs) => dtf(prefs, { weekday: "short", day: "numeric", month: "short" }).format(ms);

export const formatDateTimeRange = (start: number, end: number, prefs: FormatPrefs) =>
  `${formatDateLong(start, prefs)}, ${formatTime(start, prefs)} – ${formatTime(end, prefs)}`;

export function formatDuration(minutes: number, locale: string): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const unit = (value: number, u: "hour" | "minute") =>
    new Intl.NumberFormat(locale, { style: "unit", unit: u, unitDisplay: "short" }).format(value);
  if (hours && rest) return `${unit(hours, "hour")} ${unit(rest, "minute")}`;
  return hours ? unit(hours, "hour") : unit(rest, "minute");
}

/** Readable zone label such as "Europe/Istanbul (GMT+3)". */
export function timeZoneLabel(timeZone: string, at: number, locale = "en"): string {
  const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  return `${timeZone.replaceAll("_", " ")}${name ? ` (${name})` : ""}`;
}

/** Whether a locale conventionally uses a 12-hour clock (BKG-003 default). */
export function prefers12Hour(locale: string): boolean {
  return new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hour12 ?? false;
}
