import { describe, expect, it } from "vitest";
import {
  copyDay,
  dayOrder,
  eventTypeCountLabel,
  hoursPerWeek,
  nextRange,
  overrideDay,
  type Rule,
  scheduleLine,
  toMinutes,
  upcomingOverrides,
  weekGlance,
  weeklyMinutes,
} from "./week";

const weekdays = (start: string, end: string, days = [1, 2, 3, 4, 5]): Rule[] =>
  days.map((weekday) => ({ weekday, start, end }));

describe("toMinutes", () => {
  it("reads HH:mm and treats a 00:00 end as midnight", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("00:00", { end: true })).toBe(1440);
  });
});

describe("dayOrder", () => {
  it("starts the week on the host's first day", () => {
    expect(dayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(dayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("weekGlance", () => {
  it("places one bar per range as a share of the day, in week order", () => {
    const rules: Rule[] = [
      { weekday: 3, start: "13:00", end: "17:00" },
      { weekday: 3, start: "09:00", end: "12:00" },
      { weekday: 1, start: "06:00", end: "00:00" },
    ];
    const days = weekGlance(rules, 1);
    expect(days.map((d) => d.short)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(days[0].bars).toEqual([{ left: 25, width: 75 }]);
    expect(days[2].bars.map((b) => b.left)).toEqual([37.5, (13 / 24) * 100]);
    expect(days[2].summary).toBe("Wednesday: 09:00 to 12:00 and 13:00 to 17:00");
    expect(days[1]).toMatchObject({ bars: [], summary: "Tuesday: unavailable" });
  });
});

describe("weeklyMinutes / hoursPerWeek", () => {
  it("adds up the week, counting overlaps once", () => {
    expect(weeklyMinutes(weekdays("09:00", "17:00"))).toBe(40 * 60);
    expect(
      weeklyMinutes([
        { weekday: 1, start: "09:00", end: "12:00" },
        { weekday: 1, start: "11:00", end: "13:00" },
        { weekday: 2, start: "22:00", end: "00:00" },
      ]),
    ).toBe(6 * 60);
  });

  it("words the total", () => {
    expect(hoursPerWeek(37 * 60)).toBe("37 hours a week");
    expect(hoursPerWeek(450)).toBe("7.5 hours a week");
    expect(hoursPerWeek(60)).toBe("1 hour a week");
    expect(hoursPerWeek(0)).toBe("No weekly hours");
  });
});

describe("scheduleLine", () => {
  it("summarises days, hours and usage", () => {
    expect(scheduleLine(weekdays("09:00", "17:00"), 1, 4)).toBe("Mon – Fri · 09:00 – 17:00 · 4 event types");
    expect(scheduleLine([], 1, 1)).toBe("No working days · 1 event type");
    expect(eventTypeCountLabel(0)).toBe("0 event types");
  });
});

describe("nextRange", () => {
  it("offers working hours on an empty day and the next hour otherwise", () => {
    expect(nextRange([])).toEqual({ start: "09:00", end: "17:00" });
    expect(nextRange([{ start: "09:00", end: "12:00" }])).toEqual({ start: "12:00", end: "13:00" });
    expect(nextRange([{ start: "20:00", end: "23:30" }])).toEqual({ start: "23:30", end: "00:00" });
  });

  it("returns null when the day is full", () => {
    expect(nextRange([{ start: "09:00", end: "00:00" }])).toBeNull();
    expect(nextRange([{ start: "09:00", end: "23:50" }])).toBeNull();
  });
});

describe("copyDay", () => {
  it("replaces the target days with the source day's ranges", () => {
    const rules: Rule[] = [
      { weekday: 1, start: "09:00", end: "12:00" },
      { weekday: 1, start: "13:00", end: "17:00" },
      { weekday: 2, start: "10:00", end: "11:00" },
      { weekday: 5, start: "08:00", end: "09:00" },
    ];
    expect(copyDay(rules, 1, [1, 2, 6])).toEqual([
      { weekday: 1, start: "09:00", end: "12:00" },
      { weekday: 1, start: "13:00", end: "17:00" },
      { weekday: 2, start: "09:00", end: "12:00" },
      { weekday: 2, start: "13:00", end: "17:00" },
      { weekday: 5, start: "08:00", end: "09:00" },
      { weekday: 6, start: "09:00", end: "12:00" },
      { weekday: 6, start: "13:00", end: "17:00" },
    ]);
  });

  it("copies an unavailable day as unavailable", () => {
    expect(copyDay(weekdays("09:00", "17:00"), 0, [1, 2])).toEqual(weekdays("09:00", "17:00", [3, 4, 5]));
  });
});

describe("overrideDay / upcomingOverrides", () => {
  it("builds the date tile without time zone drift", () => {
    expect(overrideDay("2026-10-02")).toEqual({ month: "Oct", day: 2, weekday: "Friday", label: "2 October" });
    expect(overrideDay("2027-01-31")).toMatchObject({ month: "Jan", weekday: "Sunday" });
  });

  it("counts overrides from today on", () => {
    expect(
      upcomingOverrides([{ date: "2026-09-28" }, { date: "2026-09-29" }, { date: "2026-10-09" }], "2026-09-29"),
    ).toBe(2);
  });
});
