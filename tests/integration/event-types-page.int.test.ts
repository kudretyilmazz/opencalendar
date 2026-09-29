import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBooking } from "@/features/bookings/server/service";
import { createEventType, findPublicEventType, findPublicHost } from "@/features/event-types/server/service";
import { countWeekBookings, listMyTeamEventTypes } from "@/features/event-types/server/list";
import { createTeamEventType, setHosts } from "@/features/teams/server/event-types";
import { createTeam } from "@/features/teams/server/service";
import { testDatabase } from "./helpers";
import { form, world } from "./team-fixtures";

const { db, close } = testDatabase();
afterAll(close);

const at = (iso: string) => Date.parse(iso);
const NOW = at("2026-10-01T10:10:00Z"); // Thursday
const booker = { name: "Grace", email: "grace@example.com", timeZone: "UTC", locale: "en" };

let teamId = "";
let introId = "";
let demoId = "";
let roundRobinId = "";

beforeAll(async () => {
  teamId = await world(db); // ada owner, bob admin, cy + dee members, eve outsider
  introId = await createEventType(db, "ada", form({ title: "Intro", slug: "intro" }));
  demoId = await createEventType(db, "ada", form({ title: "Demo", slug: "demo" }));

  const host = (await findPublicHost(db, "ada"))!;
  const intro = (await findPublicEventType(db, host.id, "intro"))!;
  const demo = (await findPublicEventType(db, host.id, "demo"))!;
  const book = (eventType: typeof intro, start: string) =>
    createBooking(db, {
      host,
      eventType,
      start: at(start),
      durationMin: 30,
      booker,
      guests: [],
      now: at("2026-09-20T08:00:00Z"),
    });
  await book(intro, "2026-09-24T10:00:00Z"); // last week
  await book(intro, "2026-09-28T09:00:00Z"); // Monday this week
  await book(intro, "2026-10-01T09:00:00Z");
  await book(demo, "2026-10-02T15:00:00Z"); // Friday
  await book(demo, "2026-10-05T09:00:00Z"); // next week

  roundRobinId = await createTeamEventType(
    db,
    "ada",
    teamId,
    "round_robin",
    form({ title: "Discovery", slug: "discovery" }),
  );
  await setHosts(db, "ada", teamId, roundRobinId, {
    hosts: [
      { userId: "ada", isFixed: false, weight: 100, priority: 2 },
      { userId: "cy", isFixed: false, weight: 100, priority: 2 },
    ],
    roundRobinWindowDays: 30,
  });
  await createTeamEventType(
    db,
    "ada",
    teamId,
    "collective",
    form({ title: "Review", slug: "review", durationMinutes: 45 }),
  );
  const other = await createTeam(db, "eve", { name: "Zeta", slug: "zeta", logoUrl: null, brandColor: null });
  await createTeamEventType(db, "eve", other, "collective", form({ title: "Secret", slug: "secret" }));
});

describe("countWeekBookings", () => {
  it("counts this week's active bookings per event type in the host's week", async () => {
    expect(await countWeekBookings(db, "ada", { now: NOW, timeZone: "UTC", weekStart: 1 })).toEqual({
      [introId]: 2,
      [demoId]: 1,
    });
  });

  it("follows the host's week start", async () => {
    // Weeks starting Thursday: Oct 1 – Oct 7 drops Monday's intro and picks up next Monday's demo.
    expect(await countWeekBookings(db, "ada", { now: NOW, timeZone: "UTC", weekStart: 4 })).toEqual({
      [introId]: 1,
      [demoId]: 2,
    });
  });

  it("shows nothing to another user", async () => {
    expect(await countWeekBookings(db, "eve", { now: NOW, timeZone: "UTC", weekStart: 1 })).toEqual({});
  });
});

describe("listMyTeamEventTypes", () => {
  it("lists the event types of the user's teams with hosts and edit rights", async () => {
    const list = await listMyTeamEventTypes(db, "cy");
    expect(list.map((t) => t.title)).toEqual(["Discovery", "Review"]);
    expect(list[0]).toMatchObject({
      id: roundRobinId,
      teamId,
      teamName: "Acme",
      schedulingType: "round_robin",
      canEdit: false,
      isHost: true,
      hosts: ["Ada", "Cy"],
    });
    expect(list[1]).toMatchObject({ schedulingType: "collective", durationMinutes: 45, isHost: false, hosts: [] });
  });

  it("lets admins edit", async () => {
    const list = await listMyTeamEventTypes(db, "bob");
    expect(list.every((t) => t.canEdit)).toBe(true);
  });

  it("never shows another team's event types", async () => {
    expect((await listMyTeamEventTypes(db, "ada")).map((t) => t.title)).toEqual(["Discovery", "Review"]);
    expect((await listMyTeamEventTypes(db, "eve")).map((t) => t.title)).toEqual(["Secret"]);
    expect(await listMyTeamEventTypes(db, "dee")).toHaveLength(2);
  });
});
