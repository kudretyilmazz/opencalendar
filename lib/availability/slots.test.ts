import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeSlots, horizonEnd, isSlotAvailable } from "./slots";
import { localParts } from "./tz";
import type { EventTypeInput, HostInput, ScheduleInput, Weekday } from "./types";

const MIN = 60_000;
const H = 60 * MIN;
const t = (iso: string) => Date.parse(iso);
const hhmm = (ms: number, tz: string) => {
  const p = localParts(ms, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
};

const weekdays = (start: string, end: string, days: Weekday[] = [1, 2, 3, 4, 5]) =>
  days.map((weekday) => ({ weekday, start, end }));

const schedule = (timeZone: string, overrides: ScheduleInput["overrides"] = [], rules = weekdays("09:00", "17:00")): ScheduleInput => ({
  timeZone,
  rules,
  overrides,
});

const host = (sched: ScheduleInput, extra: Partial<HostInput> = {}): HostInput => ({
  userId: "u1",
  schedule: sched,
  bookings: [],
  ooo: [],
  holds: [],
  ...extra,
});

const event = (extra: Partial<EventTypeInput> = {}): EventTypeInput => ({
  durationMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 0,
  horizon: { type: "unlimited" },
  ...extra,
});

const NOW = t("2026-10-01T00:00:00Z"); // a Thursday
const day = (date: string, tz = "UTC") => ({ start: t(`${date}T00:00:00Z`) - 0, end: t(`${date}T00:00:00Z`) + 24 * H, tz });

describe("computeSlots — weekly schedules", () => {
  it("#1 Europe/Istanbul Mon–Fri 09–17, 30 min → 16 slots at 06:00–14:00 UTC", () => {
    const { slots } = computeSlots(event(), host(schedule("Europe/Istanbul")), {
      now: NOW,
      window: { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-06T00:00:00Z") },
    });
    expect(slots).toHaveLength(16);
    expect(new Date(slots[0].start).toISOString()).toBe("2026-10-05T06:00:00.000Z");
    expect(new Date(slots.at(-1)!.end).toISOString()).toBe("2026-10-05T14:00:00.000Z");
  });

  it("offers nothing on days without rules (weekend)", () => {
    const { slots } = computeSlots(event(), host(schedule("UTC")), {
      now: NOW,
      window: { start: t("2026-10-03T00:00:00Z"), end: t("2026-10-05T00:00:00Z") },
    });
    expect(slots).toEqual([]);
  });

  it("#2 America/New_York spring forward: a 24h rule is 23h, no 02:xx local slots", () => {
    const tz = "America/New_York";
    const { slots } = computeSlots(
      event({ durationMin: 60 }),
      host(schedule(tz, [], [{ weekday: 0, start: "00:00", end: "00:00" }])),
      { now: t("2026-03-01T00:00:00Z"), window: { start: t("2026-03-08T05:00:00Z"), end: t("2026-03-09T04:00:00Z") } },
    );
    expect(slots).toHaveLength(23);
    expect(slots.map((s) => hhmm(s.start, tz))).not.toContain("02:00");
  });

  it("#3 America/New_York fall back: no duplicate UTC starts in the repeated hour", () => {
    const tz = "America/New_York";
    const { slots } = computeSlots(
      event({ durationMin: 30 }),
      host(schedule(tz, [], [{ weekday: 0, start: "00:30", end: "03:00" }])),
      { now: t("2026-10-01T00:00:00Z"), window: { start: t("2026-11-01T04:00:00Z"), end: t("2026-11-02T05:00:00Z") } },
    );
    const starts = slots.map((s) => s.start);
    expect(new Set(starts).size).toBe(starts.length);
    // 00:30 EDT → 03:00 EST spans 3.5 real hours = 7 half-hour slots.
    expect(slots).toHaveLength(7);
  });

  it("#4 a 09–17 rule stays 8h across the DST change week (UTC offsets shift)", () => {
    const tz = "America/New_York";
    const window = { start: t("2026-11-01T00:00:00Z"), end: t("2026-11-07T00:00:00Z") };
    const { slots } = computeSlots(event({ durationMin: 60 }), host(schedule(tz)), { now: NOW, window });
    const byDay = Map.groupBy(slots, (s) => new Date(s.start).toISOString().slice(0, 10));
    expect([...byDay.values()].every((d) => d.length === 8)).toBe(true);
    expect(new Date(byDay.get("2026-11-02")![0].start).toISOString()).toBe("2026-11-02T14:00:00.000Z"); // EST
  });

  it("#5 cross-midnight availability (22:00–24:00 + 00:00–02:00) allows a slot spanning midnight", () => {
    const rules = [
      { weekday: 1 as Weekday, start: "22:00", end: "00:00" },
      { weekday: 2 as Weekday, start: "00:00", end: "02:00" },
    ];
    const { slots } = computeSlots(event({ durationMin: 60, slotIntervalMin: 30 }), host(schedule("UTC", [], rules)), {
      now: NOW,
      window: { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-07T00:00:00Z") },
    });
    expect(slots.map((s) => new Date(s.start).toISOString())).toContain("2026-10-05T23:30:00.000Z");
  });

  it("zero-length and inverted ranges are ignored (#9)", () => {
    const rules = [{ weekday: 1 as Weekday, start: "09:00", end: "09:00" }, { weekday: 1 as Weekday, start: "12:00", end: "11:00" }];
    const { slots } = computeSlots(event(), host(schedule("UTC", [], rules)), { now: NOW, window: day("2026-10-05") });
    expect(slots).toEqual([]);
  });

  it("#10 a duration longer than any free range yields no slot", () => {
    const { slots } = computeSlots(event({ durationMin: 9 * 60 }), host(schedule("UTC")), { now: NOW, window: day("2026-10-05") });
    expect(slots).toEqual([]);
  });

  it("#20 interval 15, duration 60, free 09:10–11:00 → starts aligned to :15", () => {
    const rules = [{ weekday: 1 as Weekday, start: "09:10", end: "11:00" }];
    const { slots } = computeSlots(event({ durationMin: 60, slotIntervalMin: 15 }), host(schedule("UTC", [], rules)), {
      now: NOW,
      window: day("2026-10-05"),
    });
    expect(slots.map((s) => hhmm(s.start, "UTC"))).toEqual(["09:15", "09:30", "09:45", "10:00"]);
  });

  it("aligns to half hours in a +05:45 zone", () => {
    const { slots } = computeSlots(event(), host(schedule("Asia/Kathmandu")), {
      now: NOW,
      window: { start: t("2026-10-04T18:15:00Z"), end: t("2026-10-05T18:15:00Z") },
    });
    expect(slots.map((s) => hhmm(s.start, "Asia/Kathmandu")).slice(0, 3)).toEqual(["09:00", "09:30", "10:00"]);
  });
});

describe("computeSlots — overrides, bookings, buffers, notice, horizon", () => {
  it("#7 an empty override removes the day and is explained as date_override", () => {
    const sched = schedule("UTC", [{ date: "2026-10-05", ranges: [] }]);
    const result = computeSlots(event(), host(sched), { now: NOW, window: day("2026-10-05"), explain: true });
    expect(result.slots).toEqual([]);
    expect(result.excluded?.find((e) => hhmm(e.start, "UTC") === "10:00")?.reason).toBe("date_override");
  });

  it("#8 an override with split ranges replaces that date only", () => {
    const sched = schedule("UTC", [{ date: "2026-10-05", ranges: [{ start: "09:00", end: "10:00" }, { start: "14:00", end: "15:00" }] }]);
    const mon = computeSlots(event(), host(sched), { now: NOW, window: day("2026-10-05") }).slots;
    const tue = computeSlots(event(), host(sched), { now: NOW, window: day("2026-10-06") }).slots;
    expect(mon.map((s) => hhmm(s.start, "UTC"))).toEqual(["09:00", "09:30", "14:00", "14:30"]);
    expect(tue).toHaveLength(16);
  });

  it("an override can add hours on a normally-off day", () => {
    const sched = schedule("UTC", [{ date: "2026-10-04", ranges: [{ start: "10:00", end: "11:00" }] }]);
    expect(computeSlots(event(), host(sched), { now: NOW, window: day("2026-10-04") }).slots).toHaveLength(2);
  });

  it("existing bookings block their time with booking_conflict", () => {
    const h = host(schedule("UTC"), {
      bookings: [{ uid: "b1", start: t("2026-10-05T10:00:00Z"), end: t("2026-10-05T11:00:00Z"), bufferBeforeMin: 0, bufferAfterMin: 0 }],
    });
    const result = computeSlots(event(), h, { now: NOW, window: day("2026-10-05"), explain: true });
    const starts = result.slots.map((s) => hhmm(s.start, "UTC"));
    expect(starts).toContain("09:30");
    expect(starts).not.toContain("10:00");
    expect(starts).not.toContain("10:30");
    expect(starts).toContain("11:00");
    expect(result.excluded?.find((e) => hhmm(e.start, "UTC") === "10:30")).toMatchObject({ reason: "booking_conflict", ref: "b1" });
  });

  it("#11 buffers: existing 10/10 around 10:00–10:30, new event 15/0 → next start 11:00 with 15-min steps", () => {
    const h = host(schedule("UTC"), {
      bookings: [{ uid: "b1", start: t("2026-10-05T10:00:00Z"), end: t("2026-10-05T10:30:00Z"), bufferBeforeMin: 10, bufferAfterMin: 10 }],
    });
    const result = computeSlots(event({ bufferBeforeMin: 15, slotIntervalMin: 15 }), h, { now: NOW, window: day("2026-10-05"), explain: true });
    const starts = result.slots.map((s) => hhmm(s.start, "UTC"));
    expect(starts).not.toContain("10:45");
    expect(starts).toContain("11:00");
    expect(starts).toContain("09:15"); // ends 09:45, before the existing booking's buffer at 09:50
    expect(starts).not.toContain("09:30"); // 09:30–10:00 overlaps busy 09:50–10:40
    expect(result.excluded?.find((e) => hhmm(e.start, "UTC") === "10:45")?.reason).toBe("buffer");
  });

  it("#12 minimum notice hides earlier slots (min_notice)", () => {
    const now = t("2026-10-05T09:10:00Z");
    const result = computeSlots(event({ minNoticeMin: 120 }), host(schedule("UTC")), { now, window: day("2026-10-05"), explain: true });
    expect(hhmm(result.slots[0].start, "UTC")).toBe("11:30");
    expect(result.excluded?.find((e) => hhmm(e.start, "UTC") === "11:00")?.reason).toBe("min_notice");
  });

  it("#13 rolling 14-day horizon ends after local day 14", () => {
    const tz = "Europe/Istanbul";
    const now = t("2026-10-05T10:00:00Z"); // Monday
    expect(new Date(horizonEnd({ type: "rolling_days", days: 14 }, now, tz)).toISOString()).toBe("2026-10-18T21:00:00.000Z");
    const result = computeSlots(event({ horizon: { type: "rolling_days", days: 14 } }), host(schedule(tz)), {
      now,
      window: { start: now, end: now + 30 * 24 * H },
      explain: true,
    });
    expect(Math.max(...result.slots.map((s) => s.start))).toBeLessThan(t("2026-10-18T21:00:00Z"));
    expect(result.excluded?.some((e) => e.reason === "beyond_horizon")).toBe(true);
  });

  it("rolling business days skip weekends", () => {
    const now = t("2026-10-02T12:00:00Z"); // Friday
    // Fri(1), Mon(2), Tue(3) → ends at Wednesday 00:00.
    expect(new Date(horizonEnd({ type: "rolling_business_days", days: 3 }, now, "UTC")).toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("a fixed date range limits both ends", () => {
    const e = event({ horizon: { type: "date_range", start: "2026-10-06", end: "2026-10-07" } });
    const window = { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-09T00:00:00Z") };
    const days = new Set(computeSlots(e, host(schedule("UTC")), { now: NOW, window }).slots.map((s) => new Date(s.start).getUTCDate()));
    expect([...days]).toEqual([6, 7]);
  });

  it("#15 the booking being rescheduled is not busy", () => {
    const h = host(schedule("UTC"), {
      bookings: [{ uid: "move-me", start: t("2026-10-05T10:00:00Z"), end: t("2026-10-05T10:30:00Z"), bufferBeforeMin: 0, bufferAfterMin: 0 }],
    });
    const starts = computeSlots(event(), h, { now: NOW, window: day("2026-10-05"), rescheduleUid: "move-me" }).slots.map((s) => hhmm(s.start, "UTC"));
    expect(starts).toContain("10:00");
  });

  it("#19 OOO across midnight removes partial days (ooo)", () => {
    const h = host(schedule("UTC", [], weekdays("00:00", "00:00")), { ooo: [{ start: t("2026-10-05T20:00:00Z"), end: t("2026-10-06T04:00:00Z") }] });
    const result = computeSlots(event({ durationMin: 60 }), h, {
      now: NOW,
      window: { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-07T00:00:00Z") },
      explain: true,
    });
    expect(result.slots).toHaveLength(48 - 8);
    expect(result.excluded?.find((e) => e.start === t("2026-10-05T23:00:00Z"))?.reason).toBe("ooo");
  });

  it("external calendar busy times block slots, including the new event's buffers (AVL-006)", () => {
    const h = host(schedule("UTC"), {
      externalBusy: [{ start: t("2026-10-05T10:00:00Z"), end: t("2026-10-05T10:45:00Z"), ref: "cal-1" }],
    });
    const result = computeSlots(event({ bufferAfterMin: 15 }), h, { now: NOW, window: day("2026-10-05"), explain: true });
    const starts = result.slots.map((s) => hhmm(s.start, "UTC"));
    expect(starts).not.toContain("09:30"); // 09:30–10:00 + 15 min after-buffer reaches into 10:00
    expect(starts).toContain("09:00");
    expect(starts).toContain("11:00");
    expect(result.excluded?.find((e) => hhmm(e.start, "UTC") === "10:30")).toMatchObject({ reason: "external_calendar_busy", ref: "cal-1" });
  });

  it("slot holds of other sessions are excluded (slot_held)", () => {
    const h = host(schedule("UTC"), { holds: [{ start: t("2026-10-05T10:00:00Z"), end: t("2026-10-05T10:30:00Z") }] });
    const result = computeSlots(event(), h, { now: NOW, window: day("2026-10-05"), explain: true });
    expect(result.excluded?.find((e) => hhmm(e.start, "UTC") === "10:00")?.reason).toBe("slot_held");
  });

  it("does not return explanations unless asked", () => {
    expect(computeSlots(event(), host(schedule("UTC")), { now: NOW, window: day("2026-10-05") }).excluded).toBeUndefined();
  });

  it("rejects invalid event settings", () => {
    expect(() => computeSlots(event({ durationMin: 0 }), host(schedule("UTC")), { now: NOW, window: day("2026-10-05") })).toThrow();
    expect(() => computeSlots(event({ bufferAfterMin: -5 }), host(schedule("UTC")), { now: NOW, window: day("2026-10-05") })).toThrow();
  });
});

describe("isSlotAvailable", () => {
  const h = host(schedule("UTC"), {
    bookings: [{ uid: "b1", start: t("2026-10-05T10:00:00Z"), end: t("2026-10-05T10:30:00Z"), bufferBeforeMin: 0, bufferAfterMin: 0 }],
  });
  const slot = (iso: string, min = 30) => ({ start: t(iso), end: t(iso) + min * MIN });

  it("accepts offered slots and explains rejected ones", () => {
    expect(isSlotAvailable(event(), h, slot("2026-10-05T09:00:00Z"), { now: NOW })).toEqual({ ok: true });
    expect(isSlotAvailable(event(), h, slot("2026-10-05T10:00:00Z"), { now: NOW })).toEqual({ ok: false, reason: "booking_conflict" });
    expect(isSlotAvailable(event(), h, slot("2026-10-05T20:00:00Z"), { now: NOW })).toEqual({ ok: false, reason: "outside_working_hours" });
  });

  it("rejects misaligned starts and wrong durations", () => {
    expect(isSlotAvailable(event(), h, slot("2026-10-05T09:07:00Z"), { now: NOW })).toEqual({ ok: false, reason: "not_offered" });
    expect(isSlotAvailable(event(), h, slot("2026-10-05T09:00:00Z", 45), { now: NOW })).toEqual({ ok: false, reason: "not_offered" });
  });

  it("allows the rescheduled booking's own time", () => {
    expect(isSlotAvailable(event(), h, slot("2026-10-05T10:00:00Z"), { now: NOW, rescheduleUid: "b1" })).toEqual({ ok: true });
  });
});

describe("properties (NFR-005)", () => {
  const arbBooking = fc.record({
    startMin: fc.integer({ min: 0, max: 7 * 24 * 60 }),
    lenMin: fc.integer({ min: 5, max: 180 }),
    before: fc.integer({ min: 0, max: 30 }),
    after: fc.integer({ min: 0, max: 30 }),
  });
  const base = t("2026-10-05T00:00:00Z");

  it("no slot overlaps a busy interval or leaves working hours; results are deterministic", () => {
    fc.assert(
      fc.property(
        fc.array(arbBooking, { maxLength: 15 }),
        fc.constantFrom("UTC", "America/New_York", "Asia/Kolkata", "Pacific/Chatham"),
        fc.constantFrom(15, 30, 45, 60),
        fc.integer({ min: 0, max: 20 }),
        (raw, tz, duration, bufferBefore) => {
          const bookings = raw.map((b, i) => ({
            uid: `b${i}`,
            start: base + b.startMin * MIN,
            end: base + (b.startMin + b.lenMin) * MIN,
            bufferBeforeMin: b.before,
            bufferAfterMin: b.after,
          }));
          const e = event({ durationMin: duration, bufferBeforeMin: bufferBefore });
          const h = host(schedule(tz), { bookings });
          const q = { now: base - 24 * H, window: { start: base, end: base + 7 * 24 * H } };
          const { slots } = computeSlots(e, h, q);
          expect(computeSlots(e, h, q)).toEqual({ slots });
          for (const s of slots) {
            const padded = { start: s.start - bufferBefore * MIN, end: s.end };
            for (const b of bookings) {
              const busy = { start: b.start - b.bufferBeforeMin * MIN, end: b.end + b.bufferAfterMin * MIN };
              expect(busy.start < padded.end && padded.start < busy.end).toBe(false);
            }
            const local = localParts(s.start, tz);
            const localEnd = localParts(s.end - 1, tz);
            expect(local.hour).toBeGreaterThanOrEqual(9);
            expect(localEnd.hour).toBeLessThan(17);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("performance", () => {
  it("#22 computes 30 days with 500 bookings in well under 100 ms", () => {
    const base = t("2026-10-01T00:00:00Z");
    const bookings = Array.from({ length: 500 }, (_, i) => ({
      uid: `b${i}`,
      start: base + i * 83 * MIN,
      end: base + i * 83 * MIN + 30 * MIN,
      bufferBeforeMin: 5,
      bufferAfterMin: 5,
    }));
    const h = host(schedule("Europe/Istanbul", [], weekdays("08:00", "20:00", [0, 1, 2, 3, 4, 5, 6])), { bookings });
    const started = performance.now();
    computeSlots(event({ slotIntervalMin: 15 }), h, { now: base, window: { start: base, end: base + 30 * 24 * H } });
    expect(performance.now() - started).toBeLessThan(100);
  });
});
