import { describe, expect, it } from "vitest";
import type { ConnectionView } from "../server/connections";
import { accountDisplay, calendarsSummary, plural } from "./display";

type Cal = ConnectionView["calendars"][number];
const cal = (over: Partial<Cal> = {}): Cal => ({
  id: "c1",
  name: "Work",
  color: null,
  readOnly: false,
  checkConflicts: true,
  isDestination: false,
  ...over,
});
const conn = (over: Partial<ConnectionView> = {}): ConnectionView => ({
  id: "k1",
  provider: "caldav",
  providerName: "CalDAV (iCloud, Fastmail, Nextcloud…)",
  label: "erin@caldav.icloud.com · 1a2b3c4d",
  invalid: false,
  lastError: null,
  calendars: [],
  ...over,
});

describe("accountDisplay", () => {
  it("names well-known CalDAV hosts and drops the label hash", () => {
    expect(accountDisplay(conn())).toEqual({ title: "iCloud", subtitle: "erin · CalDAV", mark: "iC" });
    expect(accountDisplay(conn({ label: "me@cloud.nextcloud.example.org · 0f0f0f0f" })).title).toBe("Nextcloud");
  });

  it("falls back to the host for other CalDAV servers", () => {
    expect(accountDisplay(conn({ label: "host@localhost:5232 · 00000000" }))).toEqual({ title: "localhost:5232", subtitle: "host · CalDAV", mark: "Dv" });
  });

  it("titles a feed with its calendar name and keeps the host as subtitle", () => {
    const feed = conn({ provider: "ics_feed", providerName: "ICS feed (read-only)", label: "example.org · abcdef12", calendars: [cal({ name: "example.org (read-only feed)" })] });
    expect(accountDisplay(feed)).toEqual({ title: "example.org (read-only feed)", subtitle: "example.org", mark: "" });
  });

  it("uses the provider name for OAuth accounts", () => {
    expect(accountDisplay(conn({ provider: "google", providerName: "Google Calendar", label: "erin@gmail.com" }))).toEqual({
      title: "Google Calendar",
      subtitle: "erin@gmail.com",
      mark: "G",
    });
  });
});

describe("calendarsSummary", () => {
  it("counts checked calendars on working connections and finds the destination", () => {
    const summary = calendarsSummary([
      conn({ calendars: [cal({ id: "a", isDestination: true }), cal({ id: "b", name: "Personal" }), cal({ id: "c", checkConflicts: false })] }),
      conn({ id: "k2", invalid: true, calendars: [cal({ id: "d", name: "Studio" })] }),
    ]);
    expect(summary).toEqual({ checked: 2, destination: "Work · iCloud", connections: 2, needsAttention: 1 });
  });

  it("reports no destination when none is set", () => {
    expect(calendarsSummary([])).toEqual({ checked: 0, destination: null, connections: 0, needsAttention: 0 });
  });
});

describe("plural", () => {
  it("adds an s except for one", () => {
    expect(plural(1, "calendar")).toBe("1 calendar");
    expect(plural(3, "calendar")).toBe("3 calendars");
  });
});
