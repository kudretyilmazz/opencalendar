import { describe, expect, it } from "vitest";
import {
  anchorDay,
  effectiveLayout,
  findSlotByStart,
  inRange,
  monthDays,
  monthRange,
  normalizeWeekStart,
  rangeKey,
  rangeWindow,
  shiftMonth,
  startOfWeek,
  weekDays,
  weekFor,
  weekRange,
} from "./booker-view";

const d = (year: number, month: number, day: number) => ({ year, month, day });

describe("month helpers", () => {
  it("shifts across years and lists every day", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthDays({ year: 2028, month: 2 })).toHaveLength(29);
    expect(monthRange({ year: 2026, month: 12 })).toEqual({ from: d(2026, 12, 1), to: d(2027, 1, 1) });
  });
});

describe("week range", () => {
  it("starts on the given weekday (Monday by default)", () => {
    // 2026-10-01 is a Thursday.
    expect(startOfWeek(d(2026, 10, 1), 1)).toEqual(d(2026, 9, 28));
    expect(startOfWeek(d(2026, 10, 1), 0)).toEqual(d(2026, 9, 27));
    expect(startOfWeek(d(2026, 10, 1), 6)).toEqual(d(2026, 9, 26));
    expect(startOfWeek(d(2026, 9, 28), 1)).toEqual(d(2026, 9, 28));
    expect(startOfWeek(d(2026, 10, 1), 9)).toEqual(d(2026, 9, 28));
  });

  it("normalizes unknown week starts to Monday", () => {
    expect(normalizeWeekStart(undefined)).toBe(1);
    expect(normalizeWeekStart(null)).toBe(1);
    expect(normalizeWeekStart(7)).toBe(1);
    expect(normalizeWeekStart(1.5)).toBe(1);
    expect(normalizeWeekStart(0)).toBe(0);
  });

  it("spans seven days, possibly across months and years", () => {
    const start = d(2026, 12, 28);
    expect(weekDays(start).map((x) => x.day)).toEqual([28, 29, 30, 31, 1, 2, 3]);
    expect(weekRange(start)).toEqual({ from: start, to: d(2027, 1, 4) });
    expect(rangeKey(weekRange(start))).toBe("2026-12-28/2027-01-04");
    expect(inRange(d(2027, 1, 3), weekRange(start))).toBe(true);
    expect(inRange(d(2027, 1, 4), weekRange(start))).toBe(false);
  });

  it("computes the UTC window in the booker's zone and clips it to now", () => {
    const range = weekRange(d(2026, 9, 28));
    expect(rangeWindow(range, "UTC", 0)).toEqual({ start: Date.UTC(2026, 8, 28), end: Date.UTC(2026, 9, 5) });
    // Istanbul is UTC+3 all year.
    expect(rangeWindow(range, "Europe/Istanbul", 0)).toEqual({ start: Date.UTC(2026, 8, 27, 21), end: Date.UTC(2026, 9, 4, 21) });
    const now = Date.UTC(2026, 9, 1, 12);
    expect(rangeWindow(range, "UTC", now)?.start).toBe(now);
    expect(rangeWindow(range, "UTC", Date.UTC(2026, 9, 6))).toBeNull();
  });

  it("never opens a week before the current one", () => {
    const today = d(2026, 9, 30);
    expect(weekFor(d(2026, 9, 1), today, 1)).toEqual(d(2026, 9, 28));
    expect(weekFor(d(2026, 10, 14), today, 1)).toEqual(d(2026, 10, 12));
  });
});

describe("anchorDay", () => {
  const today = d(2026, 9, 29);
  it("prefers the selected day, then the month's first day, never the past", () => {
    expect(anchorDay({ selected: d(2026, 10, 20), month: { year: 2026, month: 10 }, today })).toEqual(d(2026, 10, 20));
    expect(anchorDay({ selected: null, month: { year: 2026, month: 11 }, today })).toEqual(d(2026, 11, 1));
    expect(anchorDay({ selected: null, month: { year: 2026, month: 9 }, today })).toEqual(today);
    expect(anchorDay({ selected: d(2026, 9, 2), month: { year: 2026, month: 9 }, today })).toEqual(today);
  });
});

describe("slot matching", () => {
  const slots = [
    { start: 1000, end: 2000 },
    { start: 3000, end: 4000, seats: 2 },
  ];
  it("matches the exact start only", () => {
    expect(findSlotByStart(slots, 3000)).toEqual(slots[1]);
    expect(findSlotByStart(slots, 3001)).toBeUndefined();
    expect(findSlotByStart([], 1000)).toBeUndefined();
  });
});

describe("effectiveLayout", () => {
  it("forces the column layout on narrow screens", () => {
    expect(effectiveLayout("week", true)).toBe("column");
    expect(effectiveLayout("month", true)).toBe("column");
    expect(effectiveLayout("week", false)).toBe("week");
  });
});
