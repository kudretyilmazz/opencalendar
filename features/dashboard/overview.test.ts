import { describe, expect, it } from "vitest";
import {
  bookedMinutes,
  dayGroups,
  greeting,
  hoursSummary,
  locationSummary,
  meetingJoinUrl,
  nextOverride,
  type OverviewBooking,
  relativeStart,
  todaySummary,
  weekDelta,
  weekWindow,
  weekdayChips,
  workingDaysLabel,
  stepsLeftText,
} from "./overview";

const TZ = "Europe/Istanbul"; // UTC+3, no DST
const at = (iso: string) => Date.parse(iso);
const NOW = at("2026-09-29T11:05:00Z"); // Tue 29 Sep, 14:05 in Istanbul

const booking = (start: string, minutes: number, extra: Partial<OverviewBooking> = {}): OverviewBooking => ({
  id: start,
  uid: `uid-${start}`,
  status: "accepted",
  startAt: at(start),
  endAt: at(start) + minutes * 60_000,
  eventTitle: "Product demo",
  attendeeName: "Maya Chen",
  locationKind: "jitsi",
  locationValue: "https://meet.jit.si/oc-abc",
  ...extra,
});

describe("greeting", () => {
  it("follows the local hour", () => {
    expect(greeting(at("2026-09-29T03:00:00Z"), TZ)).toBe("Good morning");
    expect(greeting(NOW, TZ)).toBe("Good afternoon");
    expect(greeting(at("2026-09-29T16:00:00Z"), TZ)).toBe("Good evening");
    expect(greeting(at("2026-09-29T23:00:00Z"), TZ)).toBe("Good evening");
  });
});

describe("relativeStart", () => {
  it("describes how soon a meeting starts", () => {
    expect(relativeStart(NOW + 25 * 60_000, NOW)).toBe("In 25 min");
    expect(relativeStart(NOW + 30_000, NOW)).toBe("In 1 min");
    expect(relativeStart(NOW + 120 * 60_000, NOW)).toBe("In 2 h");
    expect(relativeStart(NOW + 95 * 60_000, NOW)).toBe("In 1 h 35 min");
    expect(relativeStart(NOW - 60_000, NOW)).toBe("Now");
  });
});

describe("bookedMinutes", () => {
  it("formats a total as hours and minutes", () => {
    expect(bookedMinutes(135)).toBe("2 h 15 min");
    expect(bookedMinutes(60)).toBe("1 h");
    expect(bookedMinutes(45)).toBe("45 min");
    expect(bookedMinutes(0)).toBe("0 min");
  });
});

describe("dayGroups", () => {
  it("splits bookings into today and tomorrow in the host's time zone", () => {
    const groups = dayGroups(
      [
        booking("2026-09-29T11:30:00Z", 30),
        booking("2026-09-29T20:30:00Z", 30), // 23:30 Istanbul, still today
        booking("2026-09-29T21:30:00Z", 30), // 00:30 Istanbul, tomorrow
      ],
      NOW,
      TZ,
    );
    expect(groups.map((g) => [g.day, g.bookings.length])).toEqual([
      ["today", 2],
      ["tomorrow", 1],
    ]);
    expect(groups[0].date).toEqual({ year: 2026, month: 9, day: 29 });
  });

  it("omits empty days", () => {
    expect(dayGroups([booking("2026-09-30T08:00:00Z", 30)], NOW, TZ).map((g) => g.day)).toEqual(["tomorrow"]);
    expect(dayGroups([], NOW, TZ)).toEqual([]);
  });
});

describe("todaySummary", () => {
  it("counts today's meetings and points at the next one", () => {
    const today = [booking("2026-09-29T08:00:00Z", 30), booking("2026-09-29T11:30:00Z", 30), booking("2026-09-29T13:00:00Z", 15)];
    expect(todaySummary(today, NOW)).toBe("You have 3 meetings today. The next one starts in 25 minutes.");
  });

  it("handles a meeting in progress, one meeting, and a free day", () => {
    expect(todaySummary([booking("2026-09-29T11:00:00Z", 30)], NOW)).toBe("You have 1 meeting today. It is happening now.");
    expect(todaySummary([booking("2026-09-29T13:05:00Z", 30)], NOW)).toBe("You have 1 meeting today. It starts in 2 hours.");
    expect(todaySummary([booking("2026-09-29T06:00:00Z", 30)], NOW)).toBe("You have 1 meeting today. That's all for today.");
    expect(todaySummary([], NOW)).toBe("No meetings today.");
  });
});

describe("weekWindow", () => {
  it("starts on the host's first weekday at local midnight", () => {
    const monday = weekWindow(NOW, TZ, 1);
    expect(new Date(monday.start).toISOString()).toBe("2026-09-27T21:00:00.000Z"); // Mon 28 Sep 00:00 Istanbul
    expect(monday.end - monday.start).toBe(7 * 86_400_000);
    expect(monday.start - monday.previousStart).toBe(7 * 86_400_000);
    expect(new Date(weekWindow(NOW, TZ, 0).start).toISOString()).toBe("2026-09-26T21:00:00.000Z"); // Sun 27 Sep
  });
});

describe("weekDelta", () => {
  it("compares with last week", () => {
    expect(weekDelta(12, 8)).toEqual({ text: "4 more than last week", tone: "up" });
    expect(weekDelta(5, 6)).toEqual({ text: "1 fewer than last week", tone: "down" });
    expect(weekDelta(3, 3)).toEqual({ text: "Same as last week", tone: "flat" });
  });
});

describe("locationSummary", () => {
  it("maps location kinds to an icon and label", () => {
    expect(locationSummary("jitsi", "https://meet.jit.si/x")).toEqual({ icon: "video", label: "Jitsi Meet" });
    expect(locationSummary("phone_attendee", "+905550000000")).toEqual({ icon: "phone", label: "Phone call · +905550000000" });
    expect(locationSummary("in_person", "Kadıköy office")).toEqual({ icon: "pin", label: "In person · Kadıköy office" });
    expect(locationSummary("link", "https://example.com/room")).toEqual({ icon: "video", label: "Meeting link" });
    expect(locationSummary(null, null)).toEqual({ icon: "video", label: "No location" });
  });
});

describe("meetingJoinUrl", () => {
  it("only returns http(s) links", () => {
    expect(meetingJoinUrl("https://meet.jit.si/x")).toBe("https://meet.jit.si/x");
    expect(meetingJoinUrl("+905550000000")).toBeNull();
    expect(meetingJoinUrl("javascript:alert(1)")).toBeNull();
    expect(meetingJoinUrl(null)).toBeNull();
  });
});

describe("weekdayChips", () => {
  it("orders days from the week start and marks working days", () => {
    const rules = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "17:00" }));
    expect(weekdayChips(rules, 1).map((d) => `${d.letter}${d.on ? "+" : "-"}`)).toEqual(["M+", "T+", "W+", "T+", "F+", "S-", "S-"]);
    expect(weekdayChips(rules, 0)[0]).toEqual({ weekday: 0, letter: "S", name: "Sunday", on: false });
  });
});

describe("hoursSummary", () => {
  it("shows one range when every working day matches", () => {
    const rules = [1, 2, 3].map((weekday) => ({ weekday, start: "09:00", end: "17:00" }));
    expect(hoursSummary(rules)).toBe("09:00 – 17:00");
  });

  it("says when hours vary or are missing", () => {
    expect(hoursSummary([{ weekday: 1, start: "09:00", end: "17:00" }, { weekday: 2, start: "10:00", end: "17:00" }])).toBe("Hours vary by day");
    expect(hoursSummary([{ weekday: 1, start: "09:00", end: "12:00" }, { weekday: 1, start: "13:00", end: "17:00" }])).toBe("Hours vary by day");
    expect(hoursSummary([])).toBeNull();
  });
});

describe("nextOverride", () => {
  it("finds the first override from today on", () => {
    const overrides = [
      { date: "2026-09-20", ranges: [] },
      { date: "2026-10-09", ranges: [{ start: "10:00", end: "12:00" }] },
      { date: "2026-10-02", ranges: [] },
    ];
    expect(nextOverride(overrides, { year: 2026, month: 9, day: 29 })).toEqual({ date: { year: 2026, month: 10, day: 2 }, unavailable: true });
    expect(nextOverride(overrides, { year: 2026, month: 10, day: 3 })).toEqual({ date: { year: 2026, month: 10, day: 9 }, unavailable: false });
    expect(nextOverride(overrides, { year: 2026, month: 11, day: 1 })).toBeNull();
  });
});

describe("workingDaysLabel", () => {
  const rules = (days: number[]) => days.map((weekday) => ({ weekday, start: "09:00", end: "17:00" }));
  it("collapses a run of days into a range", () => {
    expect(workingDaysLabel(rules([1, 2, 3, 4, 5]), 1)).toBe("Mon – Fri");
    expect(workingDaysLabel(rules([0, 1, 2]), 0)).toBe("Sun – Tue");
  });
  it("lists days that aren't a run", () => {
    expect(workingDaysLabel(rules([1, 3, 5]), 1)).toBe("Mon, Wed, Fri");
    expect(workingDaysLabel(rules([2]), 1)).toBe("Tue");
    expect(workingDaysLabel([], 1)).toBe("No working days");
  });
});

describe("stepsLeftText", () => {
  it("counts the remaining setup steps in words", () => {
    expect(stepsLeftText(1)).toBe("One more step and your booking page is ready to share.");
    expect(stepsLeftText(2)).toBe("Two more steps and your booking page is ready to share.");
    expect(stepsLeftText(4)).toBe("Four more steps and your booking page is ready to share.");
  });
});
