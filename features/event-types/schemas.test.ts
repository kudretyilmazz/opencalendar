import { describe, expect, it } from "vitest";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema, slugify } from "./schemas";

const valid = { ...DEFAULT_EVENT_TYPE, title: "Intro call", slug: "intro-call" };

describe("eventTypeFormSchema (EVT-001..007)", () => {
  it("accepts the defaults with a title and slug", () => {
    expect(eventTypeFormSchema.parse(valid)).toMatchObject({ title: "Intro call", durationMinutes: 30, horizonDays: 60 });
  });

  it("normalizes extra durations (dedupe, drop the default, sort)", () => {
    expect(eventTypeFormSchema.parse({ ...valid, extraDurations: [60, 15, 30, 60] }).extraDurations).toEqual([15, 60]);
  });

  it("requires days for rolling horizons and dates for a fixed range", () => {
    expect(eventTypeFormSchema.safeParse({ ...valid, horizonDays: null }).success).toBe(false);
    expect(eventTypeFormSchema.safeParse({ ...valid, horizonType: "date_range" }).success).toBe(false);
    expect(
      eventTypeFormSchema.safeParse({ ...valid, horizonType: "date_range", rangeStart: "2026-10-10", rangeEnd: "2026-10-01" }).success,
    ).toBe(false);
    const ok = eventTypeFormSchema.parse({ ...valid, horizonType: "date_range", rangeStart: "2026-10-01", rangeEnd: "2026-10-10" });
    expect(ok.horizonDays).toBeNull();
  });

  it("validates locations per kind (EVT-008, INT-010/011)", () => {
    const loc = (kind: string, value: string | null) => ({ ...valid, locations: [{ kind, value }] });
    expect(eventTypeFormSchema.safeParse(loc("link", "javascript:alert(1)")).success).toBe(false);
    expect(eventTypeFormSchema.safeParse(loc("phone_host", null)).success).toBe(false);
    expect(eventTypeFormSchema.safeParse(loc("phone_host", "0555 123")).success).toBe(false);
    expect(eventTypeFormSchema.safeParse(loc("in_person", null)).success).toBe(false);
    expect(eventTypeFormSchema.parse(loc("phone_host", "+90 (555) 123-4567")).locations).toEqual([{ kind: "phone_host", value: "+905551234567" }]);
    expect(eventTypeFormSchema.parse(loc("jitsi", "ignored")).locations).toEqual([{ kind: "jitsi", value: null }]);
    expect(eventTypeFormSchema.parse(loc("link", "https://meet.jit.si/x")).locations[0].value).toBe("https://meet.jit.si/x");
    const dup = { ...valid, locations: [{ kind: "zoom", value: null }, { kind: "zoom", value: null }] };
    expect(eventTypeFormSchema.safeParse(dup).success).toBe(false);
  });

  it("rejects out-of-range numbers and bad slugs", () => {
    for (const patch of [{ durationMinutes: 0 }, { bufferBeforeMinutes: -1 }, { maxGuests: 11 }, { slug: "Has Space" }, { slug: "-x" }]) {
      expect(eventTypeFormSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
  });
});

describe("slugify", () => {
  it("makes URL-safe slugs, including Turkish characters", () => {
    expect(slugify("Tanışma Görüşmesi (30 dk)")).toBe("tanisma-gorusmesi-30-dk");
    expect(slugify("!!!")).toBe("event");
  });
});
