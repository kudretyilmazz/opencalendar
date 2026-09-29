import { describe, expect, it } from "vitest";
import { avatarStack, firstManagedTeam, initials, plural, todayWindow } from "./overview";

describe("initials", () => {
  it("takes the first and last name's first letters", () => {
    expect(initials("Rui Robin")).toBe("RR");
    expect(initials("  mina de la kaya ")).toBe("MK");
  });
  it("handles single names and empty strings", () => {
    expect(initials("Ada")).toBe("A");
    expect(initials("   ")).toBe("?");
  });
});

describe("avatarStack", () => {
  it("shows everyone when they fit", () => {
    expect(avatarStack(["Ada Lovelace", "Bob", "Cy D"])).toEqual({ shown: ["AL", "B", "CD"], extra: 0 });
    expect(avatarStack(["A", "B", "C", "D"])).toEqual({ shown: ["A", "B", "C", "D"], extra: 0 });
  });
  it("turns the last slot into a +N counter", () => {
    expect(avatarStack(["A", "B", "C", "D", "E", "F", "G", "H"])).toEqual({ shown: ["A", "B", "C"], extra: 5 });
    expect(avatarStack(["A", "B", "C"], 2)).toEqual({ shown: ["A"], extra: 2 });
  });
  it("is empty for no one", () => {
    expect(avatarStack([])).toEqual({ shown: [], extra: 0 });
  });
});

describe("plural", () => {
  it("pluralises except for one", () => {
    expect(plural(0, "member")).toBe("0 members");
    expect(plural(1, "member")).toBe("1 member");
    expect(plural(4, "meeting")).toBe("4 meetings");
  });
});

describe("todayWindow", () => {
  it("is the viewer's local day", () => {
    const now = Date.parse("2026-09-29T22:30:00Z"); // already 30 Sep in Istanbul (UTC+3)
    expect(todayWindow(now, "Europe/Istanbul")).toEqual({
      start: Date.parse("2026-09-29T21:00:00Z"),
      end: Date.parse("2026-09-30T21:00:00Z"),
    });
    expect(todayWindow(now, "UTC")).toEqual({ start: Date.parse("2026-09-29T00:00:00Z"), end: Date.parse("2026-09-30T00:00:00Z") });
  });
});

describe("firstManagedTeam", () => {
  it("prefers a team the viewer owns, then one they administer", () => {
    const teams = [
      { id: "a", role: "member" as const },
      { id: "b", role: "admin" as const },
      { id: "c", role: "owner" as const },
    ];
    expect(firstManagedTeam(teams)?.id).toBe("c");
    expect(firstManagedTeam(teams.slice(0, 2))?.id).toBe("b");
    expect(firstManagedTeam(teams.slice(0, 1))).toBeNull();
  });
});
