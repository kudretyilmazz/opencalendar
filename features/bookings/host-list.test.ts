import { describe, expect, it } from "vitest";
import { formatAnswer, groupByDay, guestsLabel, initials, listSummary, nextBookingId, sourceLabel } from "./host-list";

const at = (iso: string) => Date.parse(iso);
const NOW = at("2026-09-29T08:00:00Z"); // 11:00 in Istanbul

describe("groupByDay", () => {
  const rows = [
    { id: "a", startAt: at("2026-09-29T11:30:00Z") },
    { id: "b", startAt: at("2026-09-29T20:30:00Z") }, // 23:30 Istanbul: still today
    { id: "c", startAt: at("2026-09-29T21:30:00Z") }, // 00:30 Istanbul: tomorrow
    { id: "d", startAt: at("2026-10-02T08:00:00Z") },
  ];

  it("groups consecutive rows by local day and names today and tomorrow", () => {
    const groups = groupByDay(rows, (r) => r.startAt, NOW, "Europe/Istanbul");
    expect(groups.map((g) => [g.relative, g.rows.map((r) => r.id)])).toEqual([
      ["today", ["a", "b"]],
      ["tomorrow", ["c"]],
      [null, ["d"]],
    ]);
    expect(groups[2].date).toEqual({ year: 2026, month: 10, day: 2 });
  });

  it("keeps descending order and names yesterday", () => {
    const past = [{ startAt: at("2026-09-28T09:00:00Z") }, { startAt: at("2026-09-20T09:00:00Z") }];
    expect(groupByDay(past, (r) => r.startAt, NOW, "UTC").map((g) => g.relative)).toEqual(["yesterday", null]);
  });

  it("returns nothing for no rows", () => {
    expect(groupByDay([], () => 0, NOW, "UTC")).toEqual([]);
  });
});

describe("row wording", () => {
  it("makes avatar initials", () => {
    expect(initials("Maya Chen")).toBe("MC");
    expect(initials("  selin  van der aydın ")).toBe("SA");
    expect(initials("cher")).toBe("C");
    expect(initials("")).toBe("?");
  });

  it("formats answers", () => {
    expect(formatAnswer(["a", "b"])).toBe("a, b");
    expect(formatAnswer(true)).toBe("Yes");
    expect(formatAnswer(false)).toBe("No");
    expect(formatAnswer(3)).toBe("3");
    expect(formatAnswer("ACME")).toBe("ACME");
  });

  it("labels the source only when there is something to say", () => {
    expect(sourceLabel("web", null)).toBeNull();
    expect(sourceLabel("web", {})).toBeNull();
    expect(sourceLabel("web", { utm_source: "newsletter" })).toBe("Booking page · utm_source=newsletter");
    expect(sourceLabel("embed", { utm_campaign: "autumn" })).toBe("Embed · utm_campaign=autumn");
    expect(sourceLabel("api", undefined)).toBe("API");
  });

  it("counts guests", () => {
    expect(guestsLabel(1)).toBe("+1 guest");
    expect(guestsLabel(2)).toBe("+2 guests");
  });
});

describe("listSummary", () => {
  it("adds up booked time", () => {
    const row = (minutes: number) => ({ startAt: 0, endAt: minutes * 60_000 });
    expect(listSummary([row(30), row(15), row(60), row(30), row(60), row(60), row(60)])).toBe(
      "7 bookings · 5 h 15 min",
    );
    expect(listSummary([row(45)])).toBe("1 booking · 45 min");
    expect(listSummary([])).toBe("0 bookings · 0 min");
  });
});

describe("nextBookingId", () => {
  const b = (id: string, status: string, start: string, minutes = 30) => ({
    id,
    status,
    startAt: at(start),
    endAt: at(start) + minutes * 60_000,
  });

  it("skips pending and finished bookings, keeps one in progress", () => {
    expect(
      nextBookingId(
        [
          b("done", "accepted", "2026-09-29T07:00:00Z"),
          b("req", "pending", "2026-09-29T09:00:00Z"),
          b("next", "accepted", "2026-09-29T10:00:00Z"),
        ],
        NOW,
      ),
    ).toBe("next");
    expect(nextBookingId([b("now", "accepted", "2026-09-29T07:45:00Z")], NOW)).toBe("now");
  });

  it("gives no countdown for a meeting more than a day away", () => {
    expect(nextBookingId([b("far", "accepted", "2026-10-02T09:00:00Z")], NOW)).toBeNull();
    expect(nextBookingId([], NOW)).toBeNull();
  });
});
