/**
 * Pure helpers behind the availability pages: the week-at-a-glance bars, hour totals, override
 * wording and the editor's range/copy operations. No clock, locale or database access here.
 */
import { hoursSummary, workingDaysLabel } from "@/features/dashboard/overview";

export type Range = { start: string; end: string };
export type Rule = Range & { weekday: number };

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_MINUTES = 24 * 60;

/** "HH:mm" → minutes after midnight; an end of "00:00" means midnight at the end of the day. */
export function toMinutes(value: string, { end = false } = {}): number {
  const minutes = Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  return end && minutes === 0 ? DAY_MINUTES : minutes;
}

const toClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Weekdays (0 = Sunday) in the host's week order. */
export const dayOrder = (weekStart: number): number[] => Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);

export type GlanceDay = {
  weekday: number;
  name: string;
  short: string;
  /** Read by screen readers in place of the bar, e.g. "Monday: 09:00 to 17:00". */
  summary: string;
  /** Position and width of each range as a percentage of the day. */
  bars: { left: number; width: number }[];
};

export function weekGlance(rules: readonly Rule[], weekStart: number): GlanceDay[] {
  return dayOrder(weekStart).map((weekday) => {
    const name = WEEKDAY_NAMES[weekday];
    const ranges = rules.filter((r) => r.weekday === weekday).toSorted((a, b) => a.start.localeCompare(b.start));
    const summary = ranges.length
      ? `${name}: ${ranges.map((r) => `${r.start} to ${r.end}`).join(" and ")}`
      : `${name}: unavailable`;
    const bars = ranges.map((r) => {
      const start = toMinutes(r.start);
      const end = Math.max(start, toMinutes(r.end, { end: true }));
      return { left: (start / DAY_MINUTES) * 100, width: ((end - start) / DAY_MINUTES) * 100 };
    });
    return { weekday, name, short: name.slice(0, 3), summary, bars };
  });
}

/** Bookable minutes per week (overlapping ranges on a day count once). */
export function weeklyMinutes(rules: readonly Rule[]): number {
  let total = 0;
  for (let weekday = 0; weekday < 7; weekday++) {
    const ranges = rules
      .filter((r) => r.weekday === weekday)
      .map((r) => [toMinutes(r.start), toMinutes(r.end, { end: true })] as const)
      .toSorted((a, b) => a[0] - b[0]);
    let reached = 0;
    for (const [start, end] of ranges) {
      const from = Math.max(start, reached);
      if (end > from) total += end - from;
      reached = Math.max(reached, end);
    }
  }
  return total;
}

/** "37 hours a week", "7.5 hours a week", "1 hour a week", "No weekly hours". */
export function hoursPerWeek(minutes: number): string {
  if (minutes <= 0) return "No weekly hours";
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hour${hours === 1 ? "" : "s"} a week`;
}

export const eventTypeCountLabel = (n: number) => `${n} event type${n === 1 ? "" : "s"}`;

/** The line under a schedule's name: "Mon – Fri · 09:00 – 17:00 · 4 event types". */
export function scheduleLine(rules: readonly Rule[], weekStart: number, eventTypes: number): string {
  const days = workingDaysLabel(rules, weekStart);
  const hours = hoursSummary(rules);
  return [days, hours, eventTypeCountLabel(eventTypes)].filter(Boolean).join(" · ");
}

/** A new range for a day: 09:00–17:00 on an empty day, else the hour after the last range (null when the day is full). */
export function nextRange(ranges: readonly Range[]): Range | null {
  if (ranges.length === 0) return { start: "09:00", end: "17:00" };
  const last = Math.max(...ranges.map((r) => toMinutes(r.end, { end: true })));
  if (last >= DAY_MINUTES - 15) return null;
  const end = Math.min(last + 60, DAY_MINUTES);
  return { start: toClock(last), end: toClock(end) };
}

/** Replaces the hours of every `targets` weekday with a copy of `from`'s. */
export function copyDay(rules: readonly Rule[], from: number, targets: readonly number[]): Rule[] {
  const source = rules.filter((r) => r.weekday === from);
  const others = targets.filter((t) => t !== from);
  const kept = rules.filter((r) => !others.includes(r.weekday));
  const copies = others.flatMap((weekday) => source.map((r) => ({ weekday, start: r.start, end: r.end })));
  return [...kept, ...copies].toSorted((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

/** The date tile of an override ("yyyy-MM-dd"): "Oct" / 2 / "Friday", plus "2 October" for labels. */
export function overrideDay(date: string): { month: string; day: number; weekday: string; label: string } {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return { month: MONTHS[month - 1], day, weekday, label: `${day} ${MONTHS_LONG[month - 1]}` };
}

/** Overrides on or after `today` ("yyyy-MM-dd"). */
export const upcomingOverrides = (overrides: readonly { date: string }[], today: string): number =>
  overrides.filter((o) => o.date >= today).length;
