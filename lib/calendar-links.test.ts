import { describe, expect, it } from "vitest";
import { googleCalendarUrl, outlookCalendarUrl } from "./calendar-links";

const ev = {
  title: "Intro & chat",
  start: Date.parse("2026-10-05T09:00:00Z"),
  end: Date.parse("2026-10-05T09:30:00Z"),
  details: "Agenda",
  location: "Room 1",
};

describe("add-to-calendar links (BKG-007)", () => {
  it("builds a Google Calendar template link with UTC dates", () => {
    const url = new URL(googleCalendarUrl(ev));
    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Intro & chat");
    expect(url.searchParams.get("dates")).toBe("20261005T090000Z/20261005T093000Z");
    expect(url.searchParams.get("location")).toBe("Room 1");
  });

  it("builds an Outlook compose deeplink with ISO dates", () => {
    const url = new URL(outlookCalendarUrl(ev));
    expect(url.origin).toBe("https://outlook.live.com");
    expect(url.searchParams.get("subject")).toBe("Intro & chat");
    expect(url.searchParams.get("startdt")).toBe("2026-10-05T09:00:00.000Z");
    expect(url.searchParams.get("enddt")).toBe("2026-10-05T09:30:00.000Z");
  });
});
