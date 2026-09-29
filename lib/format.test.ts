import { describe, expect, it } from "vitest";
import { formatDateTimeRange, formatDuration, formatTime, prefers12Hour, timeZoneLabel, formatShortDate, formatWeekdayDate } from "./format";

const at = Date.parse("2026-10-05T14:30:00Z");

describe("format (I18N-001)", () => {
  it("formats in the viewer's zone, locale and clock preference", () => {
    expect(formatTime(at, { locale: "en-US", timeZone: "America/New_York", hour12: true })).toBe("10:30 AM");
    expect(formatTime(at, { locale: "tr-TR", timeZone: "Europe/Istanbul", hour12: false })).toBe("17:30");
  });

  it("formats a range with the long date", () => {
    expect(formatDateTimeRange(at, at + 30 * 60_000, { locale: "en-US", timeZone: "UTC", hour12: false })).toBe(
      "Monday, October 5, 2026, 14:30 – 15:00",
    );
    expect(formatDateTimeRange(at, at + 30 * 60_000, { locale: "tr-TR", timeZone: "Europe/Istanbul", hour12: false })).toContain(
      "5 Ekim 2026 Pazartesi",
    );
  });

  it("formats durations", () => {
    expect(formatDuration(30, "en")).toBe("30 min");
    expect(formatDuration(60, "en")).toBe("1 hr");
    expect(formatDuration(90, "en")).toBe("1 hr 30 min");
  });

  it("labels time zones with their offset", () => {
    expect(timeZoneLabel("Asia/Kolkata", at)).toBe("Asia/Kolkata (GMT+5:30)");
  });

  it("knows 12h vs 24h locale conventions", () => {
    expect(prefers12Hour("en-US")).toBe(true);
    expect(prefers12Hour("tr-TR")).toBe(false);
  });
});

describe("formatWeekdayDate / formatShortDate", () => {
  const at = Date.parse("2026-09-29T21:30:00Z"); // already Wednesday in Istanbul
  it("formats in the given zone and locale", () => {
    expect(formatWeekdayDate(at, { locale: "en-GB", timeZone: "Europe/Istanbul", hour12: false })).toBe("Wednesday 30 September");
    expect(formatWeekdayDate(at, { locale: "en-US", timeZone: "UTC", hour12: true })).toBe("Tuesday, September 29");
    expect(formatShortDate(at, { locale: "en-GB", timeZone: "UTC", hour12: false })).toBe("Tue 29 Sept");
  });
});

