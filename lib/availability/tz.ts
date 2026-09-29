import type { Ms, Weekday } from "./types";

/**
 * Time-zone math on top of Intl (no dependencies). Wall-clock values in a zone are converted to
 * UTC instants with explicit, deterministic DST handling (AVL-004):
 * - gap (spring forward): the wall time is shifted forward by the gap length, like Temporal's
 *   "compatible" disambiguation (02:30 → 03:30);
 * - overlap (fall back): the caller chooses the earlier or later instant.
 */

export type LocalDate = { readonly year: number; readonly month: number; readonly day: number };
export type LocalParts = LocalDate & { readonly hour: number; readonly minute: number; readonly second: number };

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function localParts(ms: Ms, timeZone: string): LocalParts {
  const values: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

const QUARTER_HOUR = 15 * 60_000;
const offsetCache = new Map<string, number>();
const OFFSET_CACHE_LIMIT = 100_000;

function computeOffset(timeZone: string, ms: Ms): number {
  const p = localParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (ms - (((ms % 1000) + 1000) % 1000));
}

/**
 * Offset of `timeZone` from UTC at instant `ms` (local = utc + offset). Memoized per 15-minute
 * UTC bucket: offsets are multiples of 15 minutes and transitions happen at whole local times,
 * so a transition always falls on a bucket boundary. Intl.formatToParts is the engine's hottest
 * call otherwise (NFR-001).
 */
export function offsetMs(timeZone: string, ms: Ms): number {
  const bucket = Math.floor(ms / QUARTER_HOUR);
  const key = `${timeZone}|${bucket}`;
  let offset = offsetCache.get(key);
  if (offset === undefined) {
    offset = computeOffset(timeZone, bucket * QUARTER_HOUR);
    if (offsetCache.size >= OFFSET_CACHE_LIMIT) offsetCache.clear();
    offsetCache.set(key, offset);
  }
  return offset;
}

/**
 * UTC instant of `minutes` after local midnight of `date` in `timeZone`.
 * `minutes` may be 1440 (24:00 = next midnight).
 */
export function wallToUtc(date: LocalDate, minutes: number, timeZone: string, overlap: "earlier" | "later" = "earlier"): Ms {
  const wall = Date.UTC(date.year, date.month - 1, date.day, 0, minutes);
  const before = offsetMs(timeZone, wall - DAY_MS / 2);
  const after = offsetMs(timeZone, wall + DAY_MS / 2);
  const candidates = [...new Set([wall - before, wall - after])].filter((t) => offsetMs(timeZone, t) + t === wall);
  if (candidates.length === 0) return wall - before; // gap: shift forward by the gap length
  return overlap === "earlier" ? Math.min(...candidates) : Math.max(...candidates);
}

export function localDateOf(ms: Ms, timeZone: string): LocalDate {
  const { year, month, day } = localParts(ms, timeZone);
  return { year, month, day };
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function weekdayOf(date: LocalDate): Weekday {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() as Weekday;
}

export function formatDate(date: LocalDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** "HH:mm" → minutes after midnight. With endOfDay, "00:00" means 24:00 (1440). */
export function parseTime(value: string, options: { endOfDay?: boolean } = {}): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid time "${value}"`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return options.endOfDay && minutes === 0 ? 1440 : minutes;
}

export function parseDate(value: string): LocalDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date "${value}"`);
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (formatDate(addDays(date, 0)) !== value) throw new Error(`Invalid date "${value}"`);
  return date;
}
