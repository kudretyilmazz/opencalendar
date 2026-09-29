import { describe, expect, it } from "vitest";
import { dayKey, groupByDay, toggleSlot } from "./selection";

describe("toggleSlot", () => {
  it("adds in time order and removes", () => {
    const a = "2026-10-06T09:00:00.000Z";
    const b = "2026-10-06T08:00:00.000Z";
    const one = toggleSlot([], a, 10);
    const two = toggleSlot(one, b, 10);
    expect(two).toEqual([b, a]);
    expect(toggleSlot(two, a, 10)).toEqual([b]);
    expect(one).toEqual([a]); // inputs are not mutated
  });

  it("keeps the selection unchanged at the limit, but still allows removing", () => {
    const full = ["2026-10-06T08:00:00.000Z", "2026-10-06T09:00:00.000Z"];
    expect(toggleSlot(full, "2026-10-06T10:00:00.000Z", 2)).toBe(full);
    expect(toggleSlot(full, full[0]!, 2)).toEqual([full[1]]);
  });
});

describe("groupByDay", () => {
  it("groups by local day in the given zone", () => {
    const late = "2026-10-06T22:30:00.000Z"; // 01:30 on Oct 7 in Istanbul
    const early = "2026-10-06T07:00:00.000Z";
    expect(groupByDay([late, early], "Europe/Istanbul")).toEqual([
      { date: "2026-10-06", slots: [early] },
      { date: "2026-10-07", slots: [late] },
    ]);
    expect(groupByDay([late, early], "UTC")).toEqual([{ date: "2026-10-06", slots: [early, late] }]);
  });

  it("ignores malformed entries", () => {
    expect(groupByDay(["nope"], "UTC")).toEqual([]);
  });

  it("dayKey formats the local date", () => {
    expect(dayKey(Date.parse("2026-10-06T22:30:00Z"), "Europe/Istanbul")).toBe("2026-10-07");
  });
});
