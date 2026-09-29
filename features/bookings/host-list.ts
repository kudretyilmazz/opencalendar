/**
 * Pure helpers behind the host's Bookings page (BKG-010): day grouping, row wording and the
 * list summary. Time math goes through the host's IANA time zone; nothing here reads the clock.
 */
import { bookedMinutes } from "@/features/dashboard/overview";
import { addDays, compareDates, type LocalDate, localDateOf } from "@/lib/availability/tz";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type RelativeDay = "today" | "tomorrow" | "yesterday";

export type BookingDay<T> = { date: LocalDate; relative: RelativeDay | null; rows: T[] };

/** Consecutive rows that start on the same local day, in the order given (ascending or not). */
export function groupByDay<T>(
  rows: readonly T[],
  startOf: (row: T) => number,
  now: number,
  timeZone: string,
): BookingDay<T>[] {
  const today = localDateOf(now, timeZone);
  const relativeOf = (date: LocalDate): RelativeDay | null => {
    const diff = [-1, 0, 1].find((d) => compareDates(date, addDays(today, d)) === 0);
    return diff === 0 ? "today" : diff === 1 ? "tomorrow" : diff === -1 ? "yesterday" : null;
  };
  const groups: BookingDay<T>[] = [];
  for (const row of rows) {
    const date = localDateOf(startOf(row), timeZone);
    const last = groups.at(-1);
    if (last && compareDates(last.date, date) === 0) last.rows.push(row);
    else groups.push({ date, relative: relativeOf(date), rows: [row] });
  }
  return groups;
}

/** Up to two initials for an avatar: "Maya Chen" → "MC", "cher" → "C". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return letters.map((w) => [...w][0].toUpperCase()).join("");
}

/** "7 bookings · 5 h 15 min" (booked time across the listed rows). */
export function listSummary(rows: readonly { startAt: number; endAt: number }[]): string {
  const minutes = rows.reduce((sum, r) => sum + Math.max(0, Math.round((r.endAt - r.startAt) / MINUTE)), 0);
  return `${rows.length} booking${rows.length === 1 ? "" : "s"} · ${bookedMinutes(minutes)}`;
}

/** The next meeting worth a countdown: the first accepted one not over yet, starting within a day. */
export function nextBookingId(
  rows: readonly { id: string; status: string; startAt: number; endAt: number }[],
  now: number,
): string | null {
  const next = rows.find((r) => r.status === "accepted" && r.endAt > now);
  return next && next.startAt - now < DAY ? next.id : null;
}

/** An answer to a booking question as text. */
export function formatAnswer(value: string | string[] | boolean | number): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const SOURCE_LABELS: Record<string, string> = {
  web: "Booking page",
  embed: "Embed",
  api: "API",
  reschedule: "Rescheduled booking",
};

/** "Embed · utm_campaign=autumn"; null for a plain booking-page booking without utm parameters. */
export function sourceLabel(source: string, utm: Record<string, string> | null | undefined): string | null {
  const params = Object.entries(utm ?? {}).map(([k, v]) => `${k}=${v}`);
  if (source === "web" && params.length === 0) return null;
  return [SOURCE_LABELS[source] ?? source, ...params].join(" · ");
}

/** "+1 guest", "+3 guests". */
export const guestsLabel = (n: number): string => `+${n} guest${n === 1 ? "" : "s"}`;
