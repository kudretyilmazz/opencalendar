import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eventType, eventTypeHost } from "@/db/schema";
import { createBooking, getTeamSlots } from "@/features/bookings/server/service";
import { createEventType } from "@/features/event-types/server/service";
import { resolveBookingTarget } from "@/features/bookings/server/targets";
import { createTeamEventType, setHosts } from "@/features/teams/server/event-types";
import { removeMember } from "@/features/teams/server/removal";
import { acceptInvitation, inviteMember, listMyInvitations } from "@/features/teams/server/service";
import { booker, form, MON, NOW, world } from "./team-fixtures";
import { testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

let teamId: string;
beforeEach(async () => {
  teamId = await world(db); // ada (owner), bob (admin), cy, dee; eve is outside the team
});

const hostsOf = async (id: string) =>
  db.select().from(eventTypeHost).where(eq(eventTypeHost.eventTypeId, id)).orderBy(asc(eventTypeHost.position));

async function join(userId: string) {
  await inviteMember(db, "ada", teamId, { email: `${userId}@example.com`, role: "member" }, NOW);
  const me = { id: userId, email: `${userId}@example.com`, emailVerified: true };
  const [invite] = await listMyInvitations(db, me, NOW);
  await acceptInvitation(db, me, invite.id, NOW);
}

describe("assign all team members (TEAM-004/005)", () => {
  it("makes every member a host of a collective event type, all of them fixed", async () => {
    const et = await createTeamEventType(db, "ada", teamId, "collective", form());
    await setHosts(db, "ada", teamId, et, { hosts: [], roundRobinWindowDays: 30, assignAll: true });
    const hosts = await hostsOf(et);
    expect(hosts.map((h) => h.userId).toSorted()).toEqual(["ada", "bob", "cy", "dee"]);
    expect(hosts.every((h) => h.isFixed)).toBe(true);
    expect((await db.select().from(eventType).where(eq(eventType.id, et)))[0].assignAllTeamMembers).toBe(true);
  });

  it("keeps round-robin settings sent for a member and defaults the others", async () => {
    const et = await createTeamEventType(db, "ada", teamId, "round_robin", form());
    await setHosts(db, "ada", teamId, et, {
      hosts: [{ userId: "cy", isFixed: true, weight: 300, priority: 4 }],
      roundRobinWindowDays: 14,
      assignAll: true,
    });
    const hosts = await hostsOf(et);
    expect(hosts.find((h) => h.userId === "cy")).toMatchObject({ isFixed: true, weight: 300, priority: 4 });
    expect(hosts.find((h) => h.userId === "dee")).toMatchObject({ isFixed: false, weight: 100, priority: 2 });
  });

  it("adds people who join later, only to assign-all event types", async () => {
    const all = await createTeamEventType(db, "ada", teamId, "collective", form({ slug: "all" }));
    const picked = await createTeamEventType(db, "ada", teamId, "round_robin", form({ slug: "picked" }));
    await setHosts(db, "ada", teamId, all, { hosts: [], roundRobinWindowDays: 30, assignAll: true });
    await setHosts(db, "ada", teamId, picked, { hosts: [{ userId: "cy", isFixed: false, weight: 100, priority: 2 }], roundRobinWindowDays: 30 });

    await join("eve");
    const allHosts = await hostsOf(all);
    expect(allHosts.at(-1)).toMatchObject({ userId: "eve", isFixed: true, position: 4 });
    expect((await hostsOf(picked)).map((h) => h.userId)).toEqual(["cy"]);
  });

  it("drops members who leave, and stops adding once it is turned off", async () => {
    const et = await createTeamEventType(db, "ada", teamId, "collective", form());
    await setHosts(db, "ada", teamId, et, { hosts: [], roundRobinWindowDays: 30, assignAll: true });
    await removeMember(db, { actorId: "ada", teamId, userId: "dee", futureBookings: "cancel", now: NOW }, { onCancelled: async () => {}, onReassigned: async () => {} });
    expect((await hostsOf(et)).map((h) => h.userId)).not.toContain("dee");

    await setHosts(db, "ada", teamId, et, { hosts: [{ userId: "ada", isFixed: true, weight: 100, priority: 2 }], roundRobinWindowDays: 30, assignAll: false });
    await join("eve");
    expect((await hostsOf(et)).map((h) => h.userId)).toEqual(["ada"]);
  });

  it("offers only times when every member is free", async () => {
    const et = await createTeamEventType(db, "ada", teamId, "collective", form());
    await setHosts(db, "ada", teamId, et, { hosts: [], roundRobinWindowDays: 30, assignAll: true });
    // Dee is busy at 10:00 with a personal booking.
    await createEventType(db, "dee", form({ title: "Own", slug: "own" }));
    const own = (await resolveBookingTarget(db, { username: "dee", slug: "own" }))!;
    await createBooking(db, { host: own.host, eventType: own.eventType, start: MON("10:00"), durationMin: 30, booker: booker(9), guests: [], now: NOW });

    const target = (await resolveBookingTarget(db, { team: "acme", slug: "intro" }))!;
    expect(target.hosts).toHaveLength(4);
    const starts = (await getTeamSlots(db, { eventType: target.eventType, hosts: target.hosts!, durationMin: 30, window: { start: MON("00:00"), end: MON("23:59") }, now: NOW })).map((s) => s.start);
    expect(starts).not.toContain(MON("10:00"));
    expect(starts).toContain(MON("11:00"));
  });
});
