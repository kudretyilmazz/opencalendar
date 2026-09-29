import { describe, expect, it } from "vitest";
import { parseBookingLinkParams, parseDateParam, parseDurationParam, parseLayout, parseMonthParam, parseSlotParam, withLayoutParam } from "./booking-link";

describe("parseSlotParam", () => {
  it("accepts ISO 8601 UTC instants", () => {
    expect(parseSlotParam("2026-10-01T09:30:00Z")).toBe(Date.UTC(2026, 9, 1, 9, 30));
    expect(parseSlotParam("2026-10-01T09:30:00.000Z")).toBe(Date.UTC(2026, 9, 1, 9, 30));
    expect(parseSlotParam("2026-10-01T09:30:00.5Z")).toBe(Date.UTC(2026, 9, 1, 9, 30, 0, 500));
    expect(parseSlotParam("2026-10-01T09:30Z")).toBe(Date.UTC(2026, 9, 1, 9, 30));
    expect(parseSlotParam("2026-10-01T09:30:00+00:00")).toBe(Date.UTC(2026, 9, 1, 9, 30));
  });

  it("ignores anything else", () => {
    for (const bad of [
      undefined,
      "",
      "tomorrow",
      "1759311000000",
      "2026-10-01",
      "2026-10-01T09:30:00", // no zone
      "2026-10-01T09:30:00+03:00", // not UTC
      "2026-02-30T09:30:00Z",
      "2026-10-01T24:00:00Z",
      "2026-10-01T09:60:00Z",
      "1999-10-01T09:30:00Z",
      "2026-10-01T09:30:00Z<script>",
    ]) {
      expect(parseSlotParam(bad)).toBeUndefined();
    }
    expect(parseSlotParam(["2026-10-01T09:30:00Z"])).toBeUndefined();
  });
});

describe("other link params", () => {
  it("validates date, duration and layout", () => {
    expect(parseDateParam("2026-10-01")).toBe("2026-10-01");
    expect(parseDateParam("2026-02-30")).toBeUndefined();
    expect(parseDateParam("2026-1-1")).toBeUndefined();
    expect(parseMonthParam("2026-10")).toBe("2026-10");
    expect(parseMonthParam("2026-13")).toBeUndefined();
    expect(parseMonthParam("2026-1")).toBeUndefined();
    expect(parseDurationParam("30")).toBe(30);
    expect(parseDurationParam("0")).toBeUndefined();
    expect(parseDurationParam("-5")).toBeUndefined();
    expect(parseDurationParam("30.5")).toBeUndefined();
    expect(parseDurationParam("99999")).toBeUndefined();
    expect(parseLayout("week")).toBe("week");
    expect(parseLayout("column")).toBe("column");
    expect(parseLayout("month")).toBe("month");
    expect(parseLayout("grid")).toBeUndefined();
    expect(parseLayout(undefined)).toBeUndefined();
  });

  it("parses a query, taking the first of repeated values and dropping invalid ones", () => {
    expect(parseBookingLinkParams({ date: "2026-10-01", month: "2026-11", duration: "45", slot: "2026-10-01T09:30:00Z", layout: ["week", "month"] })).toEqual({
      date: "2026-10-01",
      month: "2026-11",
      duration: 45,
      slot: Date.UTC(2026, 9, 1, 9, 30),
      layout: "week",
    });
    expect(parseBookingLinkParams({ date: "x", month: "m", duration: "y", slot: "z", layout: "w", name: "Eve" })).toEqual({});
  });
});

describe("withLayoutParam", () => {
  it("sets layout and keeps other parameters and the hash", () => {
    expect(withLayoutParam("https://cal.example.com/ada/intro?embed=1&layout=month&name=Eve#x", "week")).toBe(
      "https://cal.example.com/ada/intro?embed=1&layout=week&name=Eve#x",
    );
    expect(withLayoutParam("https://cal.example.com/ada/intro", "column")).toBe("https://cal.example.com/ada/intro?layout=column");
  });
});
