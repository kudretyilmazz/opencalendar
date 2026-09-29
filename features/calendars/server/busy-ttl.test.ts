import { describe, expect, it } from "vitest";
import { cacheTtlMs } from "./busy";

describe("calendar polling interval (AVL-007)", () => {
  it("uses CALENDAR_POLL_SECONDS for CalDAV/ICS and caps Google/Microsoft at 2 minutes", () => {
    expect(cacheTtlMs("caldav", 300)).toBe(300_000);
    expect(cacheTtlMs("ics_feed", 60)).toBe(60_000);
    expect(cacheTtlMs("google", 600)).toBe(120_000);
    expect(cacheTtlMs("microsoft", 60)).toBe(60_000);
    expect(cacheTtlMs("zoom", 300)).toBe(0);
    expect(cacheTtlMs("caldav", undefined)).toBe(300_000);
  });
});
