import type { BookingLayout } from "@/features/embed/target";
import { addDays, compareDates, formatDate, type LocalDate, wallToUtc, weekdayOf } from "@/lib/availability/tz";

/** Pure calendar math for the booking widget's layouts (month, week, column). */

export type Slot = { start: number; end: number; seats?: number };
export type Month = { year: number; month: number };
/** A half-open range of local days [from, to). */
export type DayRange = { from: LocalDate; to: LocalDate };

/** Week layout default when the host's week start isn't known. */
export const DEFAULT_WEEK_START = 1;

export const shiftMonth = (m: Month, delta: number): Month => {
  const d = new Date(Date.UTC(m.year, m.month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};

export const monthOf = (d: LocalDate): Month => ({ year: d.year, month: d.month });

export const monthRange = (m: Month): DayRange => ({ from: { ...m, day: 1 }, to: { ...shiftMonth(m, 1), day: 1 } });

export function monthDays(m: Month): LocalDate[] {
  const days: LocalDate[] = [];
  for (let d: LocalDate = { ...m, day: 1 }; d.month === m.month; d = addDays(d, 1)) days.push(d);
  return days;
}

/** 0 = Sunday … 6 = Saturday; anything else falls back to Monday. */
export const normalizeWeekStart = (value: number | null | undefined): number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6 ? (value as number) : DEFAULT_WEEK_START;

/** The first day of the week containing `date`. */
export function startOfWeek(date: LocalDate, weekStart: number): LocalDate {
  return addDays(date, -((weekdayOf(date) - normalizeWeekStart(weekStart) + 7) % 7));
}

export const weekRange = (start: LocalDate): DayRange => ({ from: start, to: addDays(start, 7) });

export const weekDays = (start: LocalDate): LocalDate[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/**
 * The UTC window to ask slots for: the range's days in `timeZone`, never before `now`.
 * Null when the whole range is in the past.
 */
export function rangeWindow(range: DayRange, timeZone: string, now: number): { start: number; end: number } | null {
  const start = Math.max(now, wallToUtc(range.from, 0, timeZone));
  const end = wallToUtc(range.to, 0, timeZone);
  return end > start ? { start, end } : null;
}

export const rangeKey = (range: DayRange) => `${formatDate(range.from)}/${formatDate(range.to)}`;

export const inRange = (d: LocalDate, range: DayRange) => compareDates(d, range.from) >= 0 && compareDates(d, range.to) < 0;

export const maxDate = (a: LocalDate, b: LocalDate) => (compareDates(a, b) >= 0 ? a : b);

/** The free slot starting exactly at `start` (a `slot=` link), if any. */
export const findSlotByStart = (slots: readonly Slot[], start: number): Slot | undefined => slots.find((s) => s.start === start);

/** Phones get the single-column layout: a 7-column week or side-by-side panes don't fit. */
export const effectiveLayout = (layout: BookingLayout, narrow: boolean): BookingLayout => (narrow ? "column" : layout);

/**
 * Where the calendar opens when the booker switches layout or arrives with a date: the chosen
 * day, else the first day of the visible month (or today, when that month is the current one).
 */
export function anchorDay(options: { selected: LocalDate | null; month: Month; today: LocalDate }): LocalDate {
  const { selected, month, today } = options;
  if (selected) return maxDate(selected, today);
  return maxDate({ ...month, day: 1 }, today);
}

/** The week to show for an anchor day, never before the current week. */
export const weekFor = (anchor: LocalDate, today: LocalDate, weekStart: number): LocalDate =>
  maxDate(startOfWeek(anchor, weekStart), startOfWeek(today, weekStart));
