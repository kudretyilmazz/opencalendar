import { describe, expect, it } from "vitest";
import { eventTypeTarget, formTarget, profileTarget, teamEventTypeTarget, teamTarget } from "./targets";

describe("embed targets", () => {
  it("profile", () => {
    expect(profileTarget("ada", "Ada Lovelace")).toEqual({ kind: "profile", calLink: "ada", label: "Ada Lovelace" });
    expect(profileTarget(null, "Ada")).toBeNull();
    expect(profileTarget("ada", "")?.label).toBe("ada");
  });

  it("event type with booking details for the email embed", () => {
    expect(eventTypeTarget("ada", { slug: "intro", title: "Intro call", durations: [60, 30, 30, 0] })).toEqual({
      kind: "eventType",
      calLink: "ada/intro",
      label: "Intro call",
      booking: { username: "ada", slug: "intro", durations: [30, 60] },
    });
    expect(eventTypeTarget(undefined, { slug: "intro", title: "x", durations: [30] })).toBeNull();
  });

  it("team and team event types; managed types have no team page", () => {
    expect(teamTarget({ slug: "acme", name: "Acme" })).toEqual({ kind: "team", calLink: "team/acme", label: "Acme" });
    expect(
      teamEventTypeTarget("acme", { slug: "demo", title: "Demo", durations: [45], schedulingType: "round_robin" }),
    ).toEqual({
      kind: "teamEventType",
      calLink: "team/acme/demo",
      label: "Demo",
      booking: { team: "acme", slug: "demo", durations: [45] },
    });
    expect(
      teamEventTypeTarget("acme", { slug: "demo", title: "Demo", durations: [45], schedulingType: "managed" }),
    ).toBeNull();
  });

  it("routing form", () => {
    expect(formTarget({ id: "3f1c-9a", name: "Contact" })).toEqual({
      kind: "form",
      calLink: "forms/3f1c-9a",
      label: "Contact",
    });
  });

  it("returns null for links the loader would reject", () => {
    expect(profileTarget("a.b", "x")).toBeNull();
    expect(teamTarget({ slug: "a/b", name: "x" })).toBeNull();
  });
});
