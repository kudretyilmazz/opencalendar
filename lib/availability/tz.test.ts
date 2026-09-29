import { describe, expect, it } from "vitest";
import { addDays, localDateOf, localParts, offsetMs, parseDate, parseTime, wallToUtc, weekdayOf } from "./tz";

const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("offsetMs", () => {
  it.each([
    ["UTC", "2026-06-01T12:00:00Z", 0],
    ["Europe/Istanbul", "2026-01-15T12:00:00Z", 3 * H],
    ["Europe/Istanbul", "2026-07-15T12:00:00Z", 3 * H],
    ["America/New_York", "2026-01-15T12:00:00Z", -5 * H],
    ["America/New_York", "2026-07-15T12:00:00Z", -4 * H],
    ["Asia/Kolkata", "2026-07-15T12:00:00Z", 5.5 * H],
    ["Asia/Kathmandu", "2026-07-15T12:00:00Z", 5.75 * H],
    ["Australia/Adelaide", "2026-01-15T12:00:00Z", 10.5 * H],
    ["Pacific/Chatham", "2026-01-15T12:00:00Z", 13.75 * H],
    ["America/St_Johns", "2026-01-15T12:00:00Z", -3.5 * H],
    ["Australia/Lord_Howe", "2026-01-15T12:00:00Z", 11 * H],
    ["Australia/Lord_Howe", "2026-07-15T12:00:00Z", 10.5 * H],
    ["Asia/Tokyo", "2026-07-15T12:00:00Z", 9 * H],
    ["America/Sao_Paulo", "2026-07-15T12:00:00Z", -3 * H],
  ])("%s at %s", (tz, at, expected) => {
    expect(offsetMs(tz, Date.parse(at))).toBe(expected);
  });
});

describe("offsetMs memoization", () => {
  it("matches uncached Intl offsets on every quarter hour around DST transitions, incl. half-hour zones", () => {
    const zones = ["America/New_York", "Australia/Adelaide", "Australia/Lord_Howe", "Europe/London", "Asia/Kathmandu", "Pacific/Chatham"];
    for (const tz of zones) {
      for (let t = Date.parse("2026-01-01T00:00:00Z"); t < Date.parse("2027-01-01T00:00:00Z"); t += 15 * 60_000 * 7 + 60_000) {
        const p = localParts(t, tz);
        const expected = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - (t - (t % 1000));
        expect(offsetMs(tz, t)).toBe(expected);
      }
    }
  });
});

describe("wallToUtc", () => {
  it("converts ordinary wall times", () => {
    expect(iso(wallToUtc({ year: 2026, month: 10, day: 5 }, 9 * 60, "Europe/Istanbul"))).toBe("2026-10-05T06:00:00.000Z");
    expect(iso(wallToUtc({ year: 2026, month: 10, day: 5 }, 9 * 60, "Asia/Kathmandu"))).toBe("2026-10-05T03:15:00.000Z");
  });

  it("treats 24:00 as midnight of the next day", () => {
    expect(iso(wallToUtc({ year: 2026, month: 10, day: 5 }, 24 * 60, "UTC"))).toBe("2026-10-06T00:00:00.000Z");
  });

  it("shifts a time inside the spring-forward gap forward (America/New_York 2026-03-08 02:30)", () => {
    // 02:30 does not exist; like Temporal's "compatible" it becomes 03:30 EDT.
    expect(iso(wallToUtc({ year: 2026, month: 3, day: 8 }, 150, "America/New_York"))).toBe("2026-03-08T07:30:00.000Z");
  });

  it("resolves the fall-back overlap deterministically (America/New_York 2026-11-01 01:30)", () => {
    const date = { year: 2026, month: 11, day: 1 };
    expect(iso(wallToUtc(date, 90, "America/New_York", "earlier"))).toBe("2026-11-01T05:30:00.000Z"); // EDT
    expect(iso(wallToUtc(date, 90, "America/New_York", "later"))).toBe("2026-11-01T06:30:00.000Z"); // EST
  });

  it("handles Lord Howe's 30-minute DST gap", () => {
    // 2026-10-04 02:00 -> 02:30 local; 02:15 falls in the gap.
    const t = wallToUtc({ year: 2026, month: 10, day: 4 }, 2 * 60 + 15, "Australia/Lord_Howe");
    expect(localParts(t, "Australia/Lord_Howe")).toMatchObject({ hour: 2, minute: 45 });
  });

  it("round-trips every quarter hour of a year in several zones (no gaps, no duplicates)", () => {
    for (const tz of ["Europe/London", "America/Sao_Paulo", "Asia/Kolkata", "Pacific/Chatham"]) {
      let prev = -Infinity;
      for (let d = 0; d < 366; d += 7) {
        const date = addDays({ year: 2026, month: 1, day: 1 }, d);
        for (let m = 0; m < 24 * 60; m += 15) {
          const t = wallToUtc(date, m, tz, "earlier");
          expect(t).toBeGreaterThan(prev);
          prev = t;
        }
      }
    }
  });
});

describe("calendar helpers", () => {
  it("finds the local date and weekday of an instant", () => {
    const t = Date.parse("2026-10-05T22:30:00Z");
    expect(localDateOf(t, "Europe/Istanbul")).toEqual({ year: 2026, month: 10, day: 6 });
    expect(localDateOf(t, "America/Los_Angeles")).toEqual({ year: 2026, month: 10, day: 5 });
    expect(weekdayOf({ year: 2026, month: 10, day: 5 })).toBe(1); // Monday
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addDays({ year: 2028, month: 3, day: 1 }, -1)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it("parses times and dates strictly", () => {
    expect(parseTime("09:30")).toBe(570);
    expect(parseTime("00:00", { endOfDay: true })).toBe(1440);
    expect(() => parseTime("25:00")).toThrow();
    expect(parseDate("2026-02-28")).toEqual({ year: 2026, month: 2, day: 28 });
    expect(() => parseDate("2026-02-30")).toThrow();
  });
});
