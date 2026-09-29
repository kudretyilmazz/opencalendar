/**
 * Pure helpers behind the dashboard home (ADM-005): grouping, wording and summaries. All time
 * math goes through the host's IANA time zone; nothing here reads the clock or the database.
 */
import { addDays, compareDates, type LocalDate, localDateOf, localParts, parseDate, wallToUtc, weekdayOf } from "@/lib/availability/tz";
import { LOCATION_LABELS, type LocationKind } from "@/features/event-types/schemas";

const MINUTE = 60_000;

export type OverviewBooking = {
  id: string;
  uid: string;
  status: "accepted" | "pending";
  startAt: number;
  endAt: number;
  eventTitle: string;
  attendeeName: string | null;
  locationKind: LocationKind | "phone" | null;
  locationValue: string | null;
};

export function greeting(now: number, timeZone: string): string {
  const { hour } = localParts(now, timeZone);
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

function hoursAndMinutes(minutes: number, hourUnit: string): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ${hourUnit} ${m} min`;
  return h ? `${h} ${hourUnit}` : `${m} min`;
}

/** "In 25 min", "In 1 h 35 min", or "Now" once it has started. */
export function relativeStart(startAt: number, now: number): string {
  if (startAt <= now) return "Now";
  return `In ${hoursAndMinutes(Math.max(1, Math.round((startAt - now) / MINUTE)), "h")}`;
}

/** Total booked time: "2 h 15 min". */
export const bookedMinutes = (minutes: number): string => hoursAndMinutes(minutes, "h");

export type DayGroup = { day: "today" | "tomorrow"; date: LocalDate; bookings: OverviewBooking[] };

/** Today's and tomorrow's bookings (host time zone), empty days left out. */
export function dayGroups(bookings: readonly OverviewBooking[], now: number, timeZone: string): DayGroup[] {
  const today = localDateOf(now, timeZone);
  const days: DayGroup[] = [
    { day: "today", date: today, bookings: [] },
    { day: "tomorrow", date: addDays(today, 1), bookings: [] },
  ];
  return days
    .map((group) => ({
      ...group,
      bookings: bookings.filter((b) => compareDates(localDateOf(b.startAt, timeZone), group.date) === 0),
    }))
    .filter((group) => group.bookings.length > 0);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The sentence under the greeting, e.g. "You have 3 meetings today. The next one starts in 25 minutes." */
export function todaySummary(today: readonly OverviewBooking[], now: number): string {
  if (today.length === 0) return "No meetings today.";
  const intro = `You have ${plural(today.length, "meeting")} today.`;
  const pronoun = today.length === 1 ? "It" : "The next one";
  if (today.some((b) => b.startAt <= now && b.endAt > now)) return `${intro} ${today.length === 1 ? "It is" : "One is"} happening now.`;
  const next = today.find((b) => b.startAt > now);
  if (!next) return `${intro} That's all for today.`;
  const minutes = Math.max(1, Math.round((next.startAt - now) / MINUTE));
  const wait = minutes < 60 ? plural(minutes, "minute") : plural(Math.round(minutes / 60), "hour");
  return `${intro} ${pronoun} starts in ${wait}.`;
}

/** This week (from the host's first weekday, local midnight) and where last week started. */
export function weekWindow(now: number, timeZone: string, weekStart: number): { start: number; end: number; previousStart: number } {
  const today = localDateOf(now, timeZone);
  const first = addDays(today, -((weekdayOf(today) - weekStart + 7) % 7));
  return {
    start: wallToUtc(first, 0, timeZone),
    end: wallToUtc(addDays(first, 7), 0, timeZone),
    previousStart: wallToUtc(addDays(first, -7), 0, timeZone),
  };
}

export function weekDelta(thisWeek: number, lastWeek: number): { text: string; tone: "up" | "down" | "flat" } {
  const diff = thisWeek - lastWeek;
  if (diff > 0) return { text: `${diff} more than last week`, tone: "up" };
  if (diff < 0) return { text: `${-diff} fewer than last week`, tone: "down" };
  return { text: "Same as last week", tone: "flat" };
}

export type LocationIcon = "video" | "phone" | "pin";

export function locationSummary(kind: OverviewBooking["locationKind"], value: string | null): { icon: LocationIcon; label: string } {
  switch (kind) {
    case "phone":
    case "phone_host":
    case "phone_attendee":
      return { icon: "phone", label: value ? `Phone call · ${value}` : "Phone call" };
    case "in_person":
      return { icon: "pin", label: value ? `In person · ${value}` : "In person" };
    case "link":
      return { icon: "video", label: "Meeting link" };
    case null:
      return { icon: "video", label: "No location" };
    default:
      return { icon: "video", label: LOCATION_LABELS[kind] };
  }
}

/** A location value the host can open to join, or null (phone numbers, addresses, unsafe schemes). */
export function meetingJoinUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

type Rule = { weekday: number; start: string; end: string };

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayChips(rules: readonly Rule[], weekStart: number): { weekday: number; letter: string; name: string; on: boolean }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const weekday = (weekStart + i) % 7;
    const name = WEEKDAY_NAMES[weekday];
    return { weekday, letter: name[0], name, on: rules.some((r) => r.weekday === weekday) };
  });
}

/** "09:00 – 17:00" when every working day has that one range. */
export function hoursSummary(rules: readonly Rule[]): string | null {
  if (rules.length === 0) return null;
  const days = new Set(rules.map((r) => r.weekday));
  const ranges = new Set(rules.map((r) => `${r.start} – ${r.end}`));
  return days.size === rules.length && ranges.size === 1 ? [...ranges][0] : "Hours vary by day";
}

export function nextOverride(
  overrides: readonly { date: string; ranges: readonly unknown[] }[],
  today: LocalDate,
): { date: LocalDate; unavailable: boolean } | null {
  const upcoming = overrides
    .map((o) => ({ date: parseDate(o.date), unavailable: o.ranges.length === 0 }))
    .filter((o) => compareDates(o.date, today) >= 0)
    .toSorted((a, b) => compareDates(a.date, b.date));
  return upcoming[0] ?? null;
}

/** "Mon – Fri" for a run of working days (in week order), else "Mon, Wed, Fri". */
export function workingDaysLabel(rules: readonly Rule[], weekStart: number): string {
  const on = weekdayChips(rules, weekStart).filter((d) => d.on);
  if (on.length === 0) return "No working days";
  const short = (d: { name: string }) => d.name.slice(0, 3);
  const first = on[0];
  const last = on[on.length - 1];
  const position = (weekday: number) => (weekday - weekStart + 7) % 7;
  const isRun = on.length > 2 && position(last.weekday) - position(first.weekday) === on.length - 1;
  return isRun ? `${short(first)} – ${short(last)}` : on.map(short).join(", ");
}

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five"];

export function stepsLeftText(left: number): string {
  return `${NUMBER_WORDS[left] ?? left} more step${left === 1 ? "" : "s"} and your booking page is ready to share.`;
}
