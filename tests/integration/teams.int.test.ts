import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { booking, bookingHost, eventType, membership, profileSettings } from "@/db/schema";
import { cancelByHost, createBooking, getTeamSlots, listHostBookings } from "@/features/bookings/server/service";
import { resolveBookingTarget } from "@/features/bookings/server/targets";
import { createEventType, getEventType, updateEventType } from "@/features/event-types/server/service";
import { createTeamEventType, setHosts, setManaged, updateTeamEventType } from "@/features/teams/server/event-types";
import { removeMember } from "@/features/teams/server/removal";
import {
  acceptInvitation,
  changeRole,
  declineInvitation,
  inviteMember,
  listMyInvitations,
} from "@/features/teams/server/service";
import { activeWorkflows, createTeamWorkflow } from "@/features/workflows/server/service";
import { DEFAULT_REMINDER } from "@/features/workflows/schemas";
import { resetDatabase, testDatabase } from "./helpers";
import { booker, code as codeOf, form, MON, NOW, world as makeWorld } from "./team-fixtures";

const world = () => makeWorld(db);
const code = (p: Promise<unknown>) => codeOf(p);

const { db, close } = testDatabase();
afterAll(close);

async function teamTarget(slug = "intro") {
  const target = await resolveBookingTarget(db, { team: "acme", slug });
  if (!target) throw new Error("no target");
  return target;
}

const bookTeam = async (start: number, n = 1) => {
  const target = await teamTarget();
  return createBooking(db, { host: target.host, hosts: target.hosts, hostsLabel: target.displayName, eventType: target.eventType, start, durationMin: 30, booker: booker(n), guests: [], now: NOW });
};

describe("team authorization (TEAM-003)", () => {
  beforeEach(() => resetDatabase(db));

  it("enforces roles on every team resource; outsiders get NOT_FOUND", async () => {
    const teamId = await world();
    const et = await createTeamEventType(db, "bob", teamId, "round_robin", form());
    const hosts = { hosts: [{ userId: "cy", isFixed: false, weight: 100, priority: 2 }], roundRobinWindowDays: 30 };
    // Outsider
    expect(await code(createTeamEventType(db, "eve", teamId, "collective", form({ slug: "x" })))).toBe("NOT_FOUND");
    expect(await code(setHosts(db, "eve", teamId, et, hosts))).toBe("NOT_FOUND");
    expect(await code(inviteMember(db, "eve", teamId, { email: "z@example.com", role: "member" }, NOW))).toBe("NOT_FOUND");
    expect(await code(createTeamWorkflow(db, "eve", teamId, DEFAULT_REMINDER))).toBe("NOT_FOUND");
    // Member
    expect(await code(createTeamEventType(db, "cy", teamId, "collective", form({ slug: "x" })))).toBe("FORBIDDEN");
    expect(await code(updateTeamEventType(db, "cy", teamId, et, form()))).toBe("FORBIDDEN");
    expect(await code(setHosts(db, "cy", teamId, et, hosts))).toBe("FORBIDDEN");
    expect(await code(inviteMember(db, "cy", teamId, { email: "z@example.com", role: "member" }, NOW))).toBe("FORBIDDEN");
    expect(await code(changeRole(db, "cy", teamId, "dee", "admin"))).toBe("FORBIDDEN");
    expect(await code(removeMember(db, { actorId: "cy", teamId, userId: "dee", futureBookings: "cancel", now: NOW }, noHooks))).toBe("FORBIDDEN");
    // Admin: manages members but not owners
    expect(await code(setHosts(db, "bob", teamId, et, hosts))).toBe("OK");
    expect(await code(inviteMember(db, "bob", teamId, { email: "o@example.com", role: "owner" }, NOW))).toBe("FORBIDDEN");
    expect(await code(changeRole(db, "bob", teamId, "ada", "member"))).toBe("FORBIDDEN");
    expect(await code(changeRole(db, "bob", teamId, "cy", "owner"))).toBe("FORBIDDEN");
    expect(await code(changeRole(db, "bob", teamId, "cy", "admin"))).toBe("OK");
    // Owner: the last owner can't be demoted
    expect(await code(changeRole(db, "ada", teamId, "ada", "admin"))).toBe("LAST_OWNER");
    expect(await code(changeRole(db, "ada", teamId, "bob", "owner"))).toBe("OK");
    expect(await code(changeRole(db, "ada", teamId, "ada", "admin"))).toBe("OK");
  });

  it("hosts must be team members", async () => {
    const teamId = await world();
    const et = await createTeamEventType(db, "ada", teamId, "collective", form());
    expect(await code(setHosts(db, "ada", teamId, et, { hosts: [{ userId: "eve", isFixed: true, weight: 100, priority: 2 }], roundRobinWindowDays: 30 }))).toBe("NOT_A_HOST");
  });
});

const noHooks = { onCancelled: async () => {}, onReassigned: async () => {} };

describe("invitations (TEAM-002)", () => {
  beforeEach(() => resetDatabase(db));

  it("only the verified owner of the invited email can accept; decline removes it", async () => {
    const teamId = await world();
    await inviteMember(db, "bob", teamId, { email: "EVE@example.com", role: "admin" }, NOW);
    const eve = { id: "eve", email: "eve@example.com", emailVerified: true };
    expect(await listMyInvitations(db, eve, NOW)).toMatchObject([{ teamName: "Acme", role: "admin" }]);
    const [invite] = await listMyInvitations(db, eve, NOW);
    expect(await code(acceptInvitation(db, { ...eve, id: "dee", email: "dee@example.com" }, invite.id, NOW))).toBe("INVITATION_NOT_FOUND");
    expect(await code(acceptInvitation(db, { ...eve, emailVerified: false }, invite.id, NOW))).toBe("EMAIL_NOT_VERIFIED");
    expect(await code(acceptInvitation(db, eve, invite.id, NOW + 15 * 86_400_000))).toBe("INVITATION_NOT_FOUND"); // expired
    expect(await acceptInvitation(db, eve, invite.id, NOW)).toBe(teamId);
    const [row] = await db.select().from(membership).where(eq(membership.userId, "eve"));
    expect(row.role).toBe("admin");
    expect(await code(inviteMember(db, "ada", teamId, { email: "eve@example.com", role: "member" }, NOW))).toBe("ALREADY_MEMBER");

    await inviteMember(db, "ada", teamId, { email: "new@example.com", role: "member" }, NOW);
    const invitee = { id: "x", email: "new@example.com", emailVerified: true };
    const [again] = await listMyInvitations(db, invitee, NOW);
    await declineInvitation(db, invitee, again.id, NOW);
    expect(await listMyInvitations(db, invitee, NOW)).toEqual([]);
  });
});

describe("round robin (TEAM-005/006/007)", () => {
  beforeEach(() => resetDatabase(db));

  it("offers the pool's union and books the least-loaded free host, recording why", async () => {
    const teamId = await world();
    const et = await createTeamEventType(db, "ada", teamId, "round_robin", form());
    await setHosts(db, "ada", teamId, et, {
      hosts: [
        { userId: "cy", isFixed: false, weight: 100, priority: 2 },
        { userId: "dee", isFixed: false, weight: 100, priority: 4 },
      ],
      roundRobinWindowDays: 30,
    });
    const target = await teamTarget();
    const slots = await getTeamSlots(db, { eventType: target.eventType, hosts: target.hosts!, durationMin: 30, window: { start: MON("00:00"), end: MON("23:59") }, now: NOW });
    expect(slots.find((s) => s.start === MON("10:00"))?.poolHostIds).toEqual(["cy", "dee"]);

    const first = await bookTeam(MON("10:00"));
    expect(first.booking.organizerId).toBe("dee"); // tie on load → higher priority
    expect(first.booking.assignmentReason).toMatch(/higher priority/);
    const second = await bookTeam(MON("10:00"), 2);
    expect(second.booking.organizerId).toBe("cy"); // dee is busy now
    const third = await bookTeam(MON("11:00"), 3);
    expect(third.booking.organizerId).toBe("dee"); // both have 1: priority again
    await expect(bookTeam(MON("10:00"), 4)).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    const rows = await db.select().from(bookingHost).where(eq(bookingHost.bookingId, first.booking.id));
    expect(rows.map((r) => r.userId)).toEqual(["dee"]);
  });

  it("fixed host + pool: the fixed host attends every booking", async () => {
    const teamId = await world();
    const et = await createTeamEventType(db, "ada", teamId, "round_robin", form());
    await setHosts(db, "ada", teamId, et, {
      hosts: [
        { userId: "bob", isFixed: true, weight: 100, priority: 2 },
        { userId: "cy", isFixed: false, weight: 100, priority: 2 },
      ],
      roundRobinWindowDays: 30,
    });
    const created = await bookTeam(MON("10:00"));
    expect(created.booking.organizerId).toBe("cy");
    const rows = await db.select().from(bookingHost).where(eq(bookingHost.bookingId, created.booking.id));
    expect(rows.map((r) => r.userId).toSorted()).toEqual(["bob", "cy"]);
    // bob is busy at 10:00 now, so nobody can take it even with a free pool host.
    await db.insert(membership).values({ teamId, userId: "eve", role: "member" });
    await setHosts(db, "ada", teamId, et, {
      hosts: [
        { userId: "bob", isFixed: true, weight: 100, priority: 2 },
        { userId: "cy", isFixed: false, weight: 100, priority: 2 },
        { userId: "eve", isFixed: false, weight: 100, priority: 2 },
      ],
      roundRobinWindowDays: 30,
    });
    await expect(bookTeam(MON("10:00"), 2)).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });
});

describe("collective (TEAM-004)", () => {
  beforeEach(() => resetDatabase(db));

  it("needs everyone free, blocks every host, and every host can see and cancel it", async () => {
    const teamId = await world();
    const et = await createTeamEventType(db, "ada", teamId, "collective", form());
    await setHosts(db, "ada", teamId, et, {
      hosts: [
        { userId: "cy", isFixed: false, weight: 100, priority: 2 },
        { userId: "dee", isFixed: false, weight: 100, priority: 2 },
      ],
      roundRobinWindowDays: 30,
    });
    // dee is already busy at 10:00 with a personal event type.
    const personal = await createEventType(db, "dee", form({ title: "Own", slug: "own" }));
    const deeEt = (await getEventType(db, "dee", personal))!;
    const deeHost = (await resolveBookingTarget(db, { username: "dee", slug: "own" }))!.host;
    await createBooking(db, { host: deeHost, eventType: deeEt, start: MON("10:00"), durationMin: 30, booker: booker(9), guests: [], now: NOW });

    const target = await teamTarget();
    const slots = await getTeamSlots(db, { eventType: target.eventType, hosts: target.hosts!, durationMin: 30, window: { start: MON("00:00"), end: MON("23:59") }, now: NOW });
    expect(slots.some((s) => s.start === MON("10:00"))).toBe(false);
    expect(slots.some((s) => s.start === MON("11:00"))).toBe(true);

    const created = await bookTeam(MON("11:00"));
    expect(created.booking.title).toBe("Intro between Acme and Booker 1");
    const hostRows = await db.select().from(bookingHost).where(eq(bookingHost.bookingId, created.booking.id));
    expect(hostRows.map((r) => r.userId).toSorted()).toEqual(["cy", "dee"]);
    const coHost = created.booking.organizerId === "cy" ? "dee" : "cy";
    expect((await listHostBookings(db, coHost, { tab: "upcoming", now: NOW })).map((b) => b.id)).toContain(created.booking.id);
    await cancelByHost(db, { hostId: coHost, bookingId: created.booking.id, now: NOW });
    expect((await db.select().from(booking).where(eq(booking.id, created.booking.id)))[0].status).toBe("cancelled");
  });
});

describe("dynamic group links (TEAM-009)", () => {
  beforeEach(() => resetDatabase(db));

  it("books everyone collectively when they share a team and opted in, else not found", async () => {
    await world();
    await createEventType(db, "cy", form());
    await db.insert(profileSettings).values(["cy", "dee", "eve"].map((userId) => ({ userId, allowDynamicGroup: true })));
    expect(await resolveBookingTarget(db, { username: "cy+eve", slug: "intro" })).toBeNull(); // eve isn't in acme
    expect(await resolveBookingTarget(db, { username: "cy+bob", slug: "intro" })).toBeNull(); // bob didn't opt in
    const target = (await resolveBookingTarget(db, { username: "cy+dee", slug: "intro" }))!;
    expect(target).toMatchObject({ kind: "group", displayName: "Cy & Dee", basePath: "/cy+dee" });
    const created = await createBooking(db, { host: target.host, hosts: target.hosts, hostsLabel: target.displayName, eventType: target.eventType, start: MON("10:00"), durationMin: 30, booker: booker(), guests: [], now: NOW });
    const hostRows = await db.select().from(bookingHost).where(eq(bookingHost.bookingId, created.booking.id));
    expect(hostRows.map((r) => r.userId).toSorted()).toEqual(["cy", "dee"]);
  });
});

describe("managed event types (TEAM-008)", () => {
  beforeEach(() => resetDatabase(db));

  it("copies the template to assignees, pushes locked fields and ignores member edits to them", async () => {
    const teamId = await world();
    const template = await createTeamEventType(db, "ada", teamId, "managed", form({ title: "Demo", slug: "demo", durationMinutes: 30 }));
    await setManaged(db, "ada", teamId, template, { lockedFields: ["title", "durations"], assignees: ["cy", "dee"], now: NOW });
    const [copy] = await db.select().from(eventType).where(eq(eventType.ownerUserId, "cy"));
    expect(copy).toMatchObject({ title: "Demo", slug: "demo", parentId: template, teamId: null });

    // Admin changes a locked field → pushed to the copies.
    await updateTeamEventType(db, "ada", teamId, template, form({ title: "Product demo", slug: "demo", durationMinutes: 45 }));
    const pushed = (await getEventType(db, "cy", copy.id))!;
    expect(pushed).toMatchObject({ title: "Product demo", durationMinutes: 45 });

    // The member can change unlocked fields, not locked ones.
    await updateEventType(db, "cy", copy.id, form({ title: "Mine", slug: "mine", durationMinutes: 15, minNoticeMinutes: 120 }));
    const edited = (await getEventType(db, "cy", copy.id))!;
    expect(edited).toMatchObject({ title: "Product demo", slug: "demo", durationMinutes: 45, minNoticeMinutes: 120 });

    // Unassigning deletes a copy without upcoming bookings.
    await setManaged(db, "ada", teamId, template, { lockedFields: ["title"], assignees: ["dee"], now: NOW });
    expect(await db.select().from(eventType).where(eq(eventType.ownerUserId, "cy"))).toEqual([]);
  });
});

describe("removing a member (TEAM-002)", () => {
  beforeEach(() => resetDatabase(db));

  it("cancel: every future team booking of the member is cancelled; a collective co-host just leaves", async () => {
    const teamId = await world();
    const et = await createTeamEventType(db, "ada", teamId, "collective", form());
    await setHosts(db, "ada", teamId, et, {
      hosts: [
        { userId: "cy", isFixed: true, weight: 100, priority: 2 },
        { userId: "dee", isFixed: true, weight: 100, priority: 2 },
      ],
      roundRobinWindowDays: 30,
    });
    const one = await bookTeam(MON("10:00"));
    const two = await bookTeam(MON("11:00"), 2);
    const coHost = one.booking.organizerId === "cy" ? "dee" : "cy";
    // Reassign on a collective booking: the co-host leaves, the meeting stays.
    await removeMember(db, { actorId: "ada", teamId, userId: coHost, futureBookings: "reassign", now: NOW }, noHooks);
    expect((await db.select().from(bookingHost).where(eq(bookingHost.bookingId, one.booking.id))).map((h) => h.userId)).toEqual([one.booking.organizerId]);
    // Cancel for the remaining organizer.
    const cancelled: string[] = [];
    await removeMember(db, { actorId: "ada", teamId, userId: one.booking.organizerId, futureBookings: "cancel", now: NOW }, { ...noHooks, onCancelled: async (_tx, row) => void cancelled.push(row.id) });
    expect(cancelled.toSorted()).toEqual([one.booking.id, two.booking.id].toSorted());
    // Owners can't be removed by admins, and the last owner can't leave.
    expect(await code(removeMember(db, { actorId: "bob", teamId, userId: "ada", futureBookings: "cancel", now: NOW }, noHooks))).toBe("FORBIDDEN");
    expect(await code(removeMember(db, { actorId: "ada", teamId, userId: "ada", futureBookings: "cancel", now: NOW }, noHooks))).toBe("LAST_OWNER");
  });

  it("reassigns round-robin bookings to a free pool host, or cancels them", async () => {
    const teamId = await world();
    const et = await createTeamEventType(db, "ada", teamId, "round_robin", form());
    await setHosts(db, "ada", teamId, et, {
      hosts: [
        { userId: "cy", isFixed: false, weight: 100, priority: 4 },
        { userId: "dee", isFixed: false, weight: 100, priority: 2 },
      ],
      roundRobinWindowDays: 30,
    });
    const a = await bookTeam(MON("10:00")); // cy (priority)
    const b = await bookTeam(MON("10:00"), 2); // dee (cy busy)
    const c = await bookTeam(MON("11:00"), 3); // 1 each → priority → cy
    expect([a.booking.organizerId, b.booking.organizerId, c.booking.organizerId]).toEqual(["cy", "dee", "cy"]);
    const reassigned: string[] = [];
    const cancelled: string[] = [];
    const result = await removeMember(
      db,
      { actorId: "ada", teamId, userId: "cy", futureBookings: "reassign", now: NOW },
      { onCancelled: async (_tx, row) => void cancelled.push(row.id), onReassigned: async (_tx, row) => void reassigned.push(row.id) },
    );
    // a (10:00) can't move: dee is busy with b. c (11:00) moves to dee.
    expect(result).toEqual({ cancelled: 1, reassigned: 1 });
    expect(cancelled).toEqual([a.booking.id]);
    expect(reassigned).toEqual([c.booking.id]);
    const [moved] = await db.select().from(booking).where(eq(booking.id, c.booking.id));
    expect(moved).toMatchObject({ organizerId: "dee", assignmentReason: expect.stringMatching(/^Reassigned after the previous host left/) });
    expect((await db.select().from(bookingHost).where(eq(bookingHost.bookingId, c.booking.id))).map((h) => h.userId)).toEqual(["dee"]);
    expect(await db.select().from(membership).where(eq(membership.userId, "cy"))).toEqual([]);
  });
});

describe("team workflows (NTF-007)", () => {
  beforeEach(() => resetDatabase(db));

  it("apply to the team's event types and managed copies", async () => {
    const teamId = await world();
    const et = await createTeamEventType(db, "ada", teamId, "collective", form());
    const template = await createTeamEventType(db, "ada", teamId, "managed", form({ slug: "demo" }));
    await setManaged(db, "ada", teamId, template, { lockedFields: [], assignees: ["cy"], now: NOW });
    const [copy] = await db.select().from(eventType).where(eq(eventType.parentId, template));
    // The default team reminder exists from team creation.
    expect((await activeWorkflows(db, et)).map((w) => w.isDefault)).toEqual([true]);
    await createTeamWorkflow(db, "bob", teamId, { ...DEFAULT_REMINDER, name: "Follow-up", trigger: "after_end", offsetMinutes: 60 });
    expect((await activeWorkflows(db, et)).length).toBe(2);
    // The copy gets the two team workflows (and no duplicate reminder of its own).
    expect((await activeWorkflows(db, copy.id)).length).toBe(2);
  });
});
