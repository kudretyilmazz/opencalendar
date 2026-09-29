import { describe, expect, it } from "vitest";
import { periodKey } from "./limits";
import { computeSlots, isSlotAvailable } from "./slots";
import type { EventTypeInput, HostInput, SameTypeBooking } from "./types";

const MIN = 60_000;
const t = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();

const host = (sameType: SameTypeBooking[] = [], timeZone = "UTC", extra: Partial<HostInput> = {}): HostInput => ({
  userId: "u1",
  schedule: { timeZone, rules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday: weekday as 1, start: "09:00", end: "12:00" })), overrides: [] },
  bookings: sameType.map((b) => ({ uid: b.uid, start: b.start, end: b.end, bufferBeforeMin: 0, bufferAfterMin: 0 })),
  ooo: [],
  holds: [],
  sameTypeBookings: sameType,
  ...extra,
});

const event = (extra: Partial<EventTypeInput> = {}): EventTypeInput => ({
  durationMin: 60,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 0,
  horizon: { type: "unlimited" },
  ...extra,
});

const NOW = t("2026-10-01T00:00:00Z");
const WEEK = { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-10T00:00:00Z") }; // Mon–Fri
const booked = (uid: string, start: string, minutes = 60, seatsTaken?: number): SameTypeBooking => ({
  uid,
  start: t(start),
  end: t(start) + minutes * MIN,
  ...(seatsTaken !== undefined && { seatsTaken }),
});

describe("periodKey", () => {
  it("uses local calendar periods with ISO weeks starting Monday", () => {
    // 2026-10-04 22:30 UTC is Monday 01:30 in Istanbul.
    const ms = t("2026-10-04T22:30:00Z");
    expect(periodKey(ms, "Europe/Istanbul", "day")).toBe("2026-10-05");
    expect(periodKey(ms, "Europe/Istanbul", "week")).toBe("2026-10-05");
    expect(periodKey(ms, "UTC", "week")).toBe("2026-09-28");
    expect(periodKey(ms, "Europe/Istanbul", "month")).toBe("2026-10");
    expect(periodKey(t("2026-12-31T22:00:00Z"), "Europe/Istanbul", "year")).toBe("2027");
  });
});

describe("booking limits (EVT-010)", () => {
  it("frequency per day: a day with the limit reached offers nothing, other days are untouched", () => {
    const result = computeSlots(event({ limits: { bookings: { day: 1 } } }), host([booked("a", "2026-10-05T09:00:00Z")]), {
      now: NOW,
      window: WEEK,
      explain: true,
    });
    expect(result.slots.filter((s) => iso(s.start).startsWith("2026-10-05"))).toEqual([]);
    expect(result.slots.filter((s) => iso(s.start).startsWith("2026-10-06"))).toHaveLength(3);
    expect(result.excluded!.find((s) => s.start === t("2026-10-05T10:00:00Z"))?.reason).toBe("limit_reached");
  });

  it("frequency per week and month count across days", () => {
    const week = computeSlots(event({ limits: { bookings: { week: 2 } } }), host([booked("a", "2026-10-05T09:00:00Z"), booked("b", "2026-10-07T09:00:00Z")]), {
      now: NOW,
      window: WEEK,
    });
    expect(week.slots).toEqual([]);
    const month = computeSlots(event({ limits: { bookings: { month: 1 } } }), host([booked("a", "2026-10-30T09:00:00Z")]), {
      now: NOW,
      window: { start: t("2026-10-30T00:00:00Z"), end: t("2026-11-03T00:00:00Z") },
    });
    expect(month.slots.map((s) => iso(s.start).slice(0, 10))).toEqual(["2026-11-02", "2026-11-02", "2026-11-02"]);
  });

  it("duration limits count booked minutes plus the candidate", () => {
    const result = computeSlots(event({ durationMin: 60, limits: { minutes: { day: 90 } } }), host([booked("a", "2026-10-05T09:00:00Z", 60)]), {
      now: NOW,
      window: { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-06T00:00:00Z") },
    });
    expect(result.slots).toEqual([]); // 60 + 60 > 90
    const shorter = computeSlots(event({ durationMin: 30, limits: { minutes: { day: 90 } } }), host([booked("a", "2026-10-05T09:00:00Z", 60)]), {
      now: NOW,
      window: { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-06T00:00:00Z") },
    });
    expect(shorter.slots.length).toBeGreaterThan(0);
  });

  it("a booking being rescheduled does not count against its own limit", () => {
    const h = host([booked("a", "2026-10-05T09:00:00Z")]);
    const e = event({ limits: { bookings: { day: 1 } } });
    const slot = { start: t("2026-10-05T11:00:00Z"), end: t("2026-10-05T12:00:00Z") };
    expect(isSlotAvailable(e, h, slot, { now: NOW })).toEqual({ ok: false, reason: "limit_reached" });
    expect(isSlotAvailable(e, h, slot, { now: NOW, rescheduleUid: "a" })).toEqual({ ok: true });
  });

  it("limits use the schedule's time zone for day boundaries", () => {
    // 21:30 UTC Sunday = 00:30 Monday in Istanbul: it counts for Monday there.
    const h = host([booked("a", "2026-10-04T21:30:00Z", 30)], "Europe/Istanbul");
    const result = computeSlots(event({ limits: { bookings: { day: 1 } } }), h, { now: NOW, window: { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-06T00:00:00Z") } });
    expect(result.slots).toEqual([]);
  });
});

describe("seats (EVT-012)", () => {
  const seated = (seats: number) => event({ seats });

  it("keeps a slot open until its seats are taken, reporting the remaining seats", () => {
    const window = { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-06T00:00:00Z") };
    const open = computeSlots(seated(3), host([booked("a", "2026-10-05T09:00:00Z", 60, 2)]), { now: NOW, window });
    expect(open.slots.find((s) => s.start === t("2026-10-05T09:00:00Z"))).toMatchObject({ seatsRemaining: 1 });
    expect(open.slots.find((s) => s.start === t("2026-10-05T10:00:00Z"))).toMatchObject({ seatsRemaining: 3 });

    const full = computeSlots(seated(3), host([booked("a", "2026-10-05T09:00:00Z", 60, 3)]), { now: NOW, window, explain: true });
    expect(full.slots.some((s) => s.start === t("2026-10-05T09:00:00Z"))).toBe(false);
    expect(full.excluded!.find((s) => s.start === t("2026-10-05T09:00:00Z"))).toMatchObject({ reason: "seats_full", ref: "a" });
  });

  it("an open seated booking still blocks overlapping candidates at other start times", () => {
    const result = computeSlots(seated(3), host([booked("a", "2026-10-05T09:00:00Z", 60, 1)]), {
      now: NOW,
      window: { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-06T00:00:00Z") },
      explain: true,
    });
    // With 60-minute slots aligned to the hour there is no partial overlap; use a 30-minute step.
    const stepped = computeSlots(event({ seats: 3, slotIntervalMin: 30 }), host([booked("a", "2026-10-05T09:00:00Z", 60, 1)]), {
      now: NOW,
      window: { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-06T00:00:00Z") },
      explain: true,
    });
    expect(result.slots.some((s) => s.start === t("2026-10-05T09:00:00Z"))).toBe(true);
    expect(stepped.excluded!.find((s) => s.start === t("2026-10-05T09:30:00Z"))?.reason).toBe("booking_conflict");
  });

  it("another visitor's hold doesn't hide a seated slot", () => {
    const h = host([], "UTC", { holds: [{ start: t("2026-10-05T09:00:00Z"), end: t("2026-10-05T10:00:00Z") }] });
    const window = { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-06T00:00:00Z") };
    expect(computeSlots(seated(3), h, { now: NOW, window }).slots.some((s) => s.start === t("2026-10-05T09:00:00Z"))).toBe(true);
    expect(computeSlots(event(), h, { now: NOW, window }).slots.some((s) => s.start === t("2026-10-05T09:00:00Z"))).toBe(false);
  });

  it("joining an open seat is not limited by booking frequency (it creates no new booking)", () => {
    const result = computeSlots(event({ seats: 3, limits: { bookings: { day: 1 } } }), host([booked("a", "2026-10-05T09:00:00Z", 60, 1)]), {
      now: NOW,
      window: { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-06T00:00:00Z") },
    });
    expect(result.slots.map((s) => iso(s.start))).toEqual(["2026-10-05T09:00:00.000Z"]);
  });
});
