import { describe, expect, it } from "vitest";
import { occurrenceStarts } from "./recurrence";

const iso = (ms: number) => new Date(ms).toISOString();

describe("occurrenceStarts (EVT-013)", () => {
  it("weekly keeps the local time across a DST change", () => {
    // 09:00 in New York: EDT until Nov 1, EST after.
    const starts = occurrenceStarts(Date.parse("2026-10-26T13:00:00Z"), 3, "weekly", "America/New_York");
    expect(starts.map(iso)).toEqual(["2026-10-26T13:00:00.000Z", "2026-11-02T14:00:00.000Z", "2026-11-09T14:00:00.000Z"]);
  });

  it("monthly keeps the day of month, clamped to short months", () => {
    const starts = occurrenceStarts(Date.parse("2027-01-31T10:00:00Z"), 4, "monthly", "UTC");
    expect(starts.map(iso)).toEqual(["2027-01-31T10:00:00.000Z", "2027-02-28T10:00:00.000Z", "2027-03-31T10:00:00.000Z", "2027-04-30T10:00:00.000Z"]);
  });

  it("monthly crosses the year boundary", () => {
    expect(occurrenceStarts(Date.parse("2026-11-15T09:00:00Z"), 3, "monthly", "UTC").map(iso)).toEqual([
      "2026-11-15T09:00:00.000Z",
      "2026-12-15T09:00:00.000Z",
      "2027-01-15T09:00:00.000Z",
    ]);
  });
});
