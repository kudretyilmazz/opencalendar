import { describe, expect, it } from "vitest";
import { formatClock, parseIsoDate, timeSlots, toIsoDate, withValue } from "./date-input";

describe("timeSlots", () => {
  it("covers a whole day in the given step", () => {
    const slots = timeSlots(15);
    expect(slots).toHaveLength(96);
    expect(slots[0]).toBe("00:00");
    expect(slots[1]).toBe("00:15");
    expect(slots.at(-1)).toBe("23:45");
  });

  it("supports coarser steps", () => {
    expect(timeSlots(60)).toHaveLength(24);
    expect(timeSlots(30)[3]).toBe("01:30");
  });
});

describe("withValue", () => {
  it("keeps the list when the value is on the grid or empty", () => {
    const slots = timeSlots(60);
    expect(withValue(slots, "09:00")).toBe(slots);
    expect(withValue(slots, "")).toBe(slots);
  });

  it("inserts an off-grid value in order without mutating the input", () => {
    const slots = ["09:00", "10:00"];
    expect(withValue(slots, "09:10")).toEqual(["09:00", "09:10", "10:00"]);
    expect(slots).toEqual(["09:00", "10:00"]);
  });
});

describe("formatClock", () => {
  it("returns 24-hour values unchanged", () => {
    expect(formatClock("17:30", false)).toBe("17:30");
  });

  it("formats 12-hour values including midnight and noon", () => {
    expect(formatClock("00:00", true)).toBe("12:00 AM");
    expect(formatClock("09:05", true)).toBe("9:05 AM");
    expect(formatClock("12:00", true)).toBe("12:00 PM");
    expect(formatClock("23:45", true)).toBe("11:45 PM");
  });
});

describe("parseIsoDate / toIsoDate", () => {
  it("round-trips a calendar date as a local date", () => {
    const date = parseIsoDate("2026-09-29");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(8);
    expect(date?.getDate()).toBe(29);
    expect(toIsoDate(date!)).toBe("2026-09-29");
  });

  it("rejects empty and malformed values", () => {
    expect(parseIsoDate(undefined)).toBeUndefined();
    expect(parseIsoDate("")).toBeUndefined();
    expect(parseIsoDate("2026-02-30")).toBeUndefined();
    expect(parseIsoDate("29.09.2026")).toBeUndefined();
  });
});
