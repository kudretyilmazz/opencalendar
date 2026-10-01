import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resolveBookingTarget } from "@/features/bookings/server/targets";
import { countHostBookings, createBooking, listHostBookings, PERSONAL_BOOKINGS } from "@/features/bookings/server/service";
import { loadDashboard } from "@/features/dashboard/server/overview";
import { createEventType } from "@/features/event-types/server/service";
import { createTeamEventType, setHosts } from "@/features/teams/server/event-types";
import { createTeam } from "@/features/teams/server/service";
import { testDatabase } from "./helpers";
import { booker, form, MON, NOW, world } from "./team-fixtures";

const { db, close } = testDatabase();
afterAll(close);

let teamId: string;
beforeEach(async () => {
  teamId = await world(db);
  // A collective team event type with Ada and Cy, and a personal one of Ada's.
  const et = await createTeamEventType(db, "ada", teamId, "collective", form({ slug: "demo" }));
  await setHosts(db, "ada", teamId, et, {
    hosts: ["ada", "cy"].map((userId) => ({ userId, isFixed: true, weight: 100, priority: 2 })),
    roundRobinWindowDays: 30,
  });
  await createEventType(db, "ada", form({ title: "Own", slug: "own" }));
  const team = (await resolveBookingTarget(db, { team: "acme", slug: "demo" }))!;
  await createBooking(db, { host: team.host, hosts: team.hosts, hostsLabel: team.displayName, eventType: team.eventType, start: MON("10:00"), durationMin: 30, booker: booker(1), guests: [], now: NOW });
  const own = (await resolveBookingTarget(db, { username: "ada", slug: "own" }))!;
  await createBooking(db, { host: own.host, eventType: own.eventType, start: MON("12:00"), durationMin: 30, booker: booker(2), guests: [], now: NOW });
});

const upcoming = (hostId: string, team?: string) => listHostBookings(db, hostId, { tab: "upcoming", team, now: NOW });

describe("team bookings on the Bookings page", () => {
  it("names the team of team bookings, and nothing for personal ones", async () => {
    const rows = await upcoming("ada");
    expect(rows.map((r) => [r.eventTitle, r.teamName])).toEqual([
      ["Intro", "Acme"],
      ["Own", null],
    ]);
  });

  it("filters by team or to personal bookings, and counts the same way", async () => {
    expect((await upcoming("ada", teamId)).map((r) => r.eventTitle)).toEqual(["Intro"]);
    expect((await upcoming("ada", PERSONAL_BOOKINGS)).map((r) => r.eventTitle)).toEqual(["Own"]);
    expect(await countHostBookings(db, "ada", { team: teamId, now: NOW })).toMatchObject({ upcoming: 1 });
  });

  it("never widens what a host sees: other teams and non-hosts get nothing", async () => {
    const otherTeam = await createTeam(db, "eve", { name: "Other", slug: "other", logoUrl: null, brandColor: null });
    expect(await upcoming("ada", otherTeam)).toEqual([]);
    // Cy co-hosts the collective booking; Dee is in the team but not a host.
    expect((await upcoming("cy")).map((r) => r.teamName)).toEqual(["Acme"]);
    expect(await upcoming("dee")).toEqual([]);
    expect(await upcoming("dee", teamId)).toEqual([]);
  });
});

describe("team bookings on the dashboard home", () => {
  it("carries the team name for the badge", async () => {
    const data = await loadDashboard(db, "ada", { now: Date.parse("2026-10-05T07:00:00Z"), timeZone: "UTC", weekStart: 1 });
    expect(data.today.map((b) => [b.eventTitle, b.teamName])).toEqual([
      ["Intro", "Acme"],
      ["Own", null],
    ]);
  });
});
