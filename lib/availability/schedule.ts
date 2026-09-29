import { normalize } from "./intervals";
import { addDays, compareDates, formatDate, type LocalDate, localDateOf, parseDate, parseTime, wallToUtc, weekdayOf } from "./tz";
import type { Interval, IntervalSet, ScheduleInput, TimeRange } from "./types";

export type ExpandedSchedule = {
  /** Working time in UTC. */
  readonly working: IntervalSet;
  /** Local days (UTC spans) whose hours come from a date override (for explanations). */
  readonly overrideDays: IntervalSet;
};

function rangeToUtc(date: LocalDate, range: TimeRange, timeZone: string): Interval | null {
  const start = parseTime(range.start);
  const end = parseTime(range.end, { endOfDay: true });
  if (end <= start) return null; // zero-length or inverted: ignored
  return { start: wallToUtc(date, start, timeZone, "earlier"), end: wallToUtc(date, end, timeZone, "later") };
}

/** Local days (in the schedule tz) that touch `window`, padded by one day on each side. */
export function localDaysCovering(window: Interval, timeZone: string): LocalDate[] {
  const first = addDays(localDateOf(window.start, timeZone), -1);
  const last = addDays(localDateOf(window.end, timeZone), 1);
  const days: LocalDate[] = [];
  for (let d = first; compareDates(d, last) <= 0; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * Expands weekly rules and date overrides into UTC working intervals (pipeline steps 2–3).
 * Overrides replace a local date's rules entirely; an override with no ranges is a day off.
 */
export function expandSchedule(schedule: ScheduleInput, window: Interval): ExpandedSchedule {
  const overridesByDate = new Map<string, readonly TimeRange[]>();
  for (const override of schedule.overrides) {
    parseDate(override.date); // validates
    overridesByDate.set(override.date, [...(overridesByDate.get(override.date) ?? []), ...override.ranges]);
  }

  const working: Interval[] = [];
  const overrideDays: Interval[] = [];
  for (const date of localDaysCovering(window, schedule.timeZone)) {
    const key = formatDate(date);
    const override = overridesByDate.get(key);
    const ranges = override ?? schedule.rules.filter((r) => r.weekday === weekdayOf(date));
    for (const range of ranges) {
      const interval = rangeToUtc(date, range, schedule.timeZone);
      if (interval) working.push(interval);
    }
    if (override) {
      overrideDays.push({
        start: wallToUtc(date, 0, schedule.timeZone),
        end: wallToUtc(addDays(date, 1), 0, schedule.timeZone),
      });
    }
  }
  return { working: normalize(working), overrideDays: normalize(overrideDays) };
}
