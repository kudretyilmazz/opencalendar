import { describe, expect, it } from "vitest";
import { busyFromIcs } from "./ical";

const cal = (...events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", ...events, "END:VCALENDAR"].join("\r\n");
const ev = (lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
const range = { start: Date.parse("2026-10-01T00:00:00Z"), end: Date.parse("2026-11-01T00:00:00Z") };
const iso = (ms: number) => new Date(ms).toISOString();

const NY_TZ = [
  "BEGIN:VTIMEZONE",
  "TZID:America/New_York",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

describe("busyFromIcs", () => {
  it("reads UTC events and keeps the UID", () => {
    const busy = busyFromIcs(cal(ev(["UID:a1", "DTSTART:20261005T100000Z", "DTEND:20261005T110000Z"])), range, "UTC");
    expect(busy).toEqual([{ start: Date.parse("2026-10-05T10:00:00Z"), end: Date.parse("2026-10-05T11:00:00Z"), externalEventId: "a1" }]);
  });

  it("uses the file's VTIMEZONE (DST aware)", () => {
    const busy = busyFromIcs(
      cal(NY_TZ, ev(["UID:b1", "DTSTART;TZID=America/New_York:20261030T090000", "DTEND;TZID=America/New_York:20261030T100000"]),
        ev(["UID:b2", "DTSTART;TZID=America/New_York:20261102T090000", "DTEND;TZID=America/New_York:20261102T100000"])),
      range,
      "UTC",
    );
    expect(busy.map((b) => iso(b.start))).toEqual(["2026-10-30T13:00:00.000Z"]);
    const nov = busyFromIcs(
      cal(NY_TZ, ev(["UID:b2", "DTSTART;TZID=America/New_York:20261102T090000", "DTEND;TZID=America/New_York:20261102T100000"])),
      { start: range.end, end: Date.parse("2026-12-01T00:00:00Z") },
      "UTC",
    );
    expect(iso(nov[0].start)).toBe("2026-11-02T14:00:00.000Z"); // EST after fall back
  });

  it("falls back to IANA names when the VTIMEZONE is missing", () => {
    const busy = busyFromIcs(cal(ev(["UID:c1", "DTSTART;TZID=Europe/Istanbul:20261005T090000", "DTEND;TZID=Europe/Istanbul:20261005T093000"])), range, "UTC");
    expect(iso(busy[0].start)).toBe("2026-10-05T06:00:00.000Z");
  });

  it("reads floating times in the host's zone", () => {
    const busy = busyFromIcs(cal(ev(["UID:d1", "DTSTART:20261005T090000", "DTEND:20261005T100000"])), range, "Asia/Kolkata");
    expect(iso(busy[0].start)).toBe("2026-10-05T03:30:00.000Z");
  });

  it("expands weekly recurrences with EXDATE and a moved occurrence", () => {
    const busy = busyFromIcs(
      cal(
        ev([
          "UID:r1",
          "DTSTART:20260105T090000Z",
          "DTEND:20260105T093000Z",
          "RRULE:FREQ=WEEKLY;BYDAY=MO",
          "EXDATE:20261012T090000Z",
        ]),
        ev(["UID:r1", "RECURRENCE-ID:20261019T090000Z", "DTSTART:20261020T150000Z", "DTEND:20261020T160000Z"]),
      ),
      range,
      "UTC",
    );
    expect(busy.map((b) => iso(b.start))).toEqual([
      "2026-10-05T09:00:00.000Z",
      "2026-10-20T15:00:00.000Z", // moved from Monday the 19th
      "2026-10-26T09:00:00.000Z",
    ]);
  });

  it("ignores transparent and cancelled events, including cancelled occurrences", () => {
    const busy = busyFromIcs(
      cal(
        ev(["UID:t1", "DTSTART:20261005T090000Z", "DTEND:20261005T100000Z", "TRANSP:TRANSPARENT"]),
        ev(["UID:t2", "DTSTART:20261006T090000Z", "DTEND:20261006T100000Z", "STATUS:CANCELLED"]),
        ev(["UID:t3", "DTSTART:20261005T120000Z", "DTEND:20261005T130000Z", "RRULE:FREQ=DAILY;COUNT=2"]),
        ev(["UID:t3", "RECURRENCE-ID:20261006T120000Z", "DTSTART:20261006T120000Z", "DTEND:20261006T130000Z", "STATUS:CANCELLED"]),
      ),
      range,
      "UTC",
    );
    expect(busy.map((b) => [b.externalEventId, iso(b.start)])).toEqual([["t3", "2026-10-05T12:00:00.000Z"]]);
  });

  it("treats opaque all-day events as busy for the whole local day", () => {
    const busy = busyFromIcs(cal(ev(["UID:ad", "DTSTART;VALUE=DATE:20261005", "DTEND;VALUE=DATE:20261006"])), range, "Europe/Istanbul");
    expect(busy.map((b) => [iso(b.start), iso(b.end)])).toEqual([["2026-10-04T21:00:00.000Z", "2026-10-05T21:00:00.000Z"]]);
  });

  it("fails closed when a recurrence has too many occurrences to expand before the range", () => {
    // Every minute since 2000: the expansion cap is hit long before October 2026.
    const busy = busyFromIcs(cal(ev(["UID:spam", "DTSTART:20000101T000000Z", "DTEND:20000101T000030Z", "RRULE:FREQ=MINUTELY"])), range, "UTC");
    expect(busy).toEqual([{ start: range.start, end: range.end, externalEventId: "spam" }]);
  });

  it("counts every override occurrence when the series master is not visible", () => {
    const busy = busyFromIcs(
      cal(
        ev(["UID:series", "RECURRENCE-ID:20261005T100000Z", "DTSTART:20261005T100000Z", "DTEND:20261005T110000Z"]),
        ev(["UID:series", "RECURRENCE-ID:20261012T100000Z", "DTSTART:20261012T120000Z", "DTEND:20261012T130000Z"]),
      ),
      range,
      "UTC",
    );
    expect(busy.map((b) => iso(b.start))).toEqual(["2026-10-05T10:00:00.000Z", "2026-10-12T12:00:00.000Z"]);
  });

  it("shares one expansion budget across events and fails closed when it runs out", () => {
    const spam = Array.from({ length: 8 }, (_, i) => ev([`UID:s${i}`, "DTSTART:20000101T000000Z", "DTEND:20000101T000030Z", "RRULE:FREQ=MINUTELY"]));
    const started = performance.now();
    const busy = busyFromIcs(cal(...spam), range, "UTC");
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(busy.every((b) => b.start === range.start && b.end === range.end)).toBe(true);
    expect(busy).toHaveLength(8);
  });

  it("merges several calendar objects (one per CalDAV resource)", () => {
    const busy = busyFromIcs(
      [cal(ev(["UID:x1", "DTSTART:20261005T090000Z", "DTEND:20261005T100000Z"])), cal(ev(["UID:x2", "DTSTART:20261006T090000Z", "DTEND:20261006T100000Z"]))],
      range,
      "UTC",
    );
    expect(busy.map((b) => b.externalEventId)).toEqual(["x1", "x2"]);
  });

  it("uses DURATION when DTEND is missing and drops events outside the range", () => {
    const busy = busyFromIcs(
      cal(ev(["UID:du", "DTSTART:20261005T090000Z", "DURATION:PT45M"]), ev(["UID:old", "DTSTART:20250105T090000Z", "DTEND:20250105T100000Z"])),
      range,
      "UTC",
    );
    expect(busy).toEqual([{ start: Date.parse("2026-10-05T09:00:00Z"), end: Date.parse("2026-10-05T09:45:00Z"), externalEventId: "du" }]);
  });

  it("rejects data that isn't iCalendar", () => {
    expect(() => busyFromIcs("<html>nope</html>", range, "UTC")).toThrow(/could not be parsed/);
  });
});
