import { describe, expect, it } from "vitest";
import {
  durationLabel,
  filterCounts,
  filterRows,
  initials,
  locationLabel,
  rowBadges,
  statusOf,
  weekSummary,
} from "./list-view";

const base = {
  enabled: true,
  hidden: false,
  requiresConfirmation: false,
  recurringFrequency: null,
  seatsPerSlot: null,
  linkOnly: false,
};

describe("event types list helpers", () => {
  it("derives the status, off before hidden", () => {
    expect(statusOf({ enabled: true, hidden: false })).toBe("active");
    expect(statusOf({ enabled: true, hidden: true })).toBe("hidden");
    expect(statusOf({ enabled: false, hidden: true })).toBe("off");
  });

  it("joins durations", () => {
    expect(durationLabel([15])).toBe("15 min");
    expect(durationLabel([30, 45, 60])).toBe("30 · 45 · 60 min");
  });

  it("summarizes locations", () => {
    expect(locationLabel([])).toBe("No location");
    expect(locationLabel([{ kind: "jitsi", value: null }])).toBe("Jitsi Meet");
    expect(locationLabel([{ kind: "phone_attendee", value: "+905551112233" }])).toBe("Phone call");
    expect(locationLabel([{ kind: "in_person", value: "Kadıköy office" }])).toBe("Kadıköy office");
    expect(locationLabel([{ kind: "in_person", value: null }])).toBe("In person");
    expect(
      locationLabel([
        { kind: "google_meet", value: null },
        { kind: "zoom", value: null },
        { kind: "link", value: "https://x" },
      ]),
    ).toBe("Google Meet +2");
  });

  it("builds badges in order of importance", () => {
    expect(rowBadges(base)).toEqual([]);
    expect(rowBadges({ ...base, hidden: true, recurringFrequency: "weekly" }).map((b) => b.label)).toEqual([
      "Hidden",
      "Weekly",
    ]);
    expect(
      rowBadges({ ...base, enabled: false, hidden: true, requiresConfirmation: true, seatsPerSlot: 4, linkOnly: true }),
    ).toEqual([
      { label: "Off", tone: "outline" },
      { label: "Requires confirmation", tone: "warning" },
      { label: "Private links only", tone: "muted" },
      { label: "4 seats", tone: "muted" },
    ]);
  });

  it("describes the week figure per status", () => {
    expect(weekSummary("active", 5)).toEqual({ value: "5", label: "this week" });
    expect(weekSummary("hidden", 1)).toEqual({ value: "1", label: "by link" });
    expect(weekSummary("off", 3)).toEqual({ value: "—", label: "not bookable" });
  });

  const rows = [
    { status: "active" as const, title: "Intro call", slug: "intro" },
    { status: "active" as const, title: "Product demo", slug: "demo" },
    { status: "hidden" as const, title: "Office hours", slug: "office-hours" },
    { status: "off" as const, title: "Onboarding", slug: "onboarding" },
  ];

  it("counts rows per filter", () => {
    expect(filterCounts(rows)).toEqual({ all: 4, active: 2, hidden: 1, off: 1 });
    expect(filterCounts([])).toEqual({ all: 0, active: 0, hidden: 0, off: 0 });
  });

  it("filters by status and searches title and slug", () => {
    expect(filterRows(rows, "all", "").length).toBe(4);
    expect(filterRows(rows, "active", "").map((r) => r.slug)).toEqual(["intro", "demo"]);
    expect(filterRows(rows, "all", "  DEMO ").map((r) => r.slug)).toEqual(["demo"]);
    expect(filterRows(rows, "all", "hours").map((r) => r.slug)).toEqual(["office-hours"]);
    expect(filterRows(rows, "off", "intro")).toEqual([]);
  });

  it("makes initials", () => {
    expect(initials("Erin Example")).toBe("EE");
    expect(initials("ada")).toBe("A");
    expect(initials("Mary Jane Watson")).toBe("MW");
    expect(initials("  ")).toBe("?");
  });
});
