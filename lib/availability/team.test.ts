import { describe, expect, it } from "vitest";
import { computeTeamSlots, teamSlotAvailability } from "./team";
import type { EventTypeInput, HostInput, WeeklyRule } from "./types";

const t = (iso: string) => Date.parse(iso);
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

const week = (start: string, end: string): WeeklyRule[] => [1, 2, 3, 4, 5].map((weekday) => ({ weekday: weekday as 1, start, end }));
const host = (userId: string, start: string, end: string, bookings: [string, number][] = []): HostInput => ({
  userId,
  schedule: { timeZone: "UTC", rules: week(start, end), overrides: [] },
  bookings: bookings.map(([iso, minutes], i) => ({ uid: `${userId}-${i}`, start: t(iso), end: t(iso) + minutes * 60_000, bufferBeforeMin: 0, bufferAfterMin: 0 })),
  ooo: [],
  holds: [],
});
const event: EventTypeInput = { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0, minNoticeMin: 0, horizon: { type: "unlimited" } };
const query = { now: t("2026-10-01T00:00:00Z"), window: { start: t("2026-10-05T00:00:00Z"), end: t("2026-10-06T00:00:00Z") } };

describe("computeTeamSlots", () => {
  it("collective: only slots where every host is free (TEAM-004)", () => {
    const result = computeTeamSlots(
      event,
      [
        { host: host("a", "09:00", "13:00"), fixed: true },
        { host: host("b", "11:00", "15:00", [["2026-10-05T12:00:00Z", 60]]), fixed: true },
      ],
      query,
    );
    expect(result.slots.map((s) => hhmm(s.start))).toEqual(["11:00"]);
    expect(result.slots[0].poolHostIds).toBeUndefined();
  });

  it("round robin: union of the pool, with the free hosts per slot (TEAM-005)", () => {
    const result = computeTeamSlots(
      event,
      [
        { host: host("a", "09:00", "11:00"), fixed: false },
        { host: host("b", "10:00", "12:00", [["2026-10-05T10:00:00Z", 60]]), fixed: false },
      ],
      query,
    );
    expect(result.slots.map((s) => [hhmm(s.start), s.poolHostIds])).toEqual([
      ["09:00", ["a"]],
      ["10:00", ["a"]],
      ["11:00", ["b"]],
    ]);
  });

  it("fixed hosts plus a pool: the fixed host must be free and one pool host too (TEAM-007)", () => {
    const result = computeTeamSlots(
      event,
      [
        { host: host("lead", "09:00", "12:00"), fixed: true },
        { host: host("a", "09:00", "10:00"), fixed: false },
        { host: host("b", "11:00", "17:00"), fixed: false },
      ],
      query,
    );
    expect(result.slots.map((s) => [hhmm(s.start), s.poolHostIds])).toEqual([
      ["09:00", ["a"]],
      ["11:00", ["b"]],
    ]);
  });

  it("explains per host and returns nothing without hosts", () => {
    expect(computeTeamSlots(event, [], query).slots).toEqual([]);
    const explained = computeTeamSlots(event, [{ host: host("a", "09:00", "10:00"), fixed: true }], { ...query, explain: true });
    expect(explained.excludedByHost?.get("a")?.some((s) => s.reason === "outside_working_hours")).toBe(true);
  });
});

describe("teamSlotAvailability", () => {
  const hosts = [
    { userId: "lead", fixed: true },
    { userId: "a", fixed: false },
    { userId: "b", fixed: false },
  ];
  it("needs every fixed host and one pool host", () => {
    expect(teamSlotAvailability((id) => id !== "a", hosts)).toEqual({ ok: true, poolHostIds: ["b"] });
    expect(teamSlotAvailability((id) => id !== "lead", hosts)).toEqual({ ok: false, blockedBy: "lead" });
    expect(teamSlotAvailability((id) => id === "lead", hosts)).toEqual({ ok: false, blockedBy: "pool" });
    expect(teamSlotAvailability(() => true, [{ userId: "x", fixed: true }])).toEqual({ ok: true, poolHostIds: [] });
  });
});
