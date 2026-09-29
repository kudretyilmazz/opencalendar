import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { booking, eventType, membership, routingForm, user, workflow } from "@/db/schema";
import { deleteAccount } from "@/features/account/server/service";
import { createBooking } from "@/features/bookings/server/service";
import { resolveBookingTarget } from "@/features/bookings/server/targets";
import { createEventType, duplicateEventType } from "@/features/event-types/server/service";
import { teamAvailability } from "@/features/teams/server/availability";
import { troubleshootableTeamEventTypes } from "@/features/teams/server/troubleshoot";
import { explainDay } from "@/features/bookings/server/explain";
import {
  createTeamEventType,
  deleteTeamEventType,
  findPublicTeamEventType,
  listPublicTeamEventTypes,
  listTeamEventTypes,
  setHosts,
  setManaged,
  setTeamEventTypeEnabled,
} from "@/features/teams/server/event-types";
import { removeMember } from "@/features/teams/server/removal";
import {
  acceptInvitation,
  cancelInvitation,
  changeRole,
  createTeam,
  deleteTeam,
  getTeam,
  inviteMember,
  listInvitations,
  listMembers,
  listMyInvitations,
  listMyTeams,
  updateTeam,
} from "@/features/teams/server/service";
import { createTeamWorkflow, createWorkflow, deleteWorkflow, listTeamWorkflows, setWorkflowEnabled, updateWorkflow } from "@/features/workflows/server/service";
import { DEFAULT_REMINDER } from "@/features/workflows/schemas";
import { testDatabase } from "./helpers";
import { booker, code, form, MON, NOW, world } from "./team-fixtures";

const { db, close } = testDatabase();
afterAll(close);

const noHooks = { onCancelled: async () => {}, onReassigned: async () => {} };
const rrHosts = (ids: string[]) => ({ hosts: ids.map((userId) => ({ userId, isFixed: false, weight: 100, priority: 2 })), roundRobinWindowDays: 30 });

async function bookTeam(slug: string, start: number, n = 1) {
  const target = (await resolveBookingTarget(db, { team: "acme", slug }))!;
  return createBooking(db, { host: target.host, hosts: target.hosts, hostsLabel: target.displayName, eventType: target.eventType, start, durationMin: 30, booker: booker(n), guests: [], now: NOW });
}

describe("team settings and members (TEAM-001…003)", () => {
  beforeEach(async () => {
    await world(db);
  });

  it("admins edit the team, members read it, owners delete it", async () => {
    const [acme] = await listMyTeams(db, "cy");
    expect(acme).toMatchObject({ name: "Acme", role: "member" });
    expect((await getTeam(db, "cy", acme.id)).role).toBe("member");
    expect(await code(getTeam(db, "eve", acme.id))).toBe("NOT_FOUND");
    expect((await listMembers(db, "cy", acme.id)).map((m) => m.userId).toSorted()).toEqual(["ada", "bob", "cy", "dee"]);
    expect(await code(listInvitations(db, "cy", acme.id))).toBe("FORBIDDEN");

    const values = { name: "Acme Inc", slug: "acme-inc", logoUrl: null, brandColor: "#2563eb" };
    expect(await code(updateTeam(db, "cy", acme.id, values))).toBe("FORBIDDEN");
    expect(await code(updateTeam(db, "bob", acme.id, values))).toBe("OK");
    await createTeam(db, "eve", { name: "Other", slug: "other", logoUrl: null, brandColor: null });
    expect(await code(updateTeam(db, "bob", acme.id, { ...values, slug: "other" }))).toBe("SLUG_TAKEN");

    expect(await code(deleteTeam(db, "bob", acme.id, NOW))).toBe("FORBIDDEN");
    expect(await code(deleteTeam(db, "ada", acme.id, NOW))).toBe("OK");
    expect(await listMyTeams(db, "cy")).toEqual([]);
  });

  it("team creation and invitations need a verified email; invitations can be cancelled", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    await db.update(user).set({ emailVerified: false }).where(eq(user.id, "eve"));
    expect(await code(createTeam(db, "eve", { name: "Spam", slug: "spam", logoUrl: null, brandColor: null }))).toBe("EMAIL_NOT_VERIFIED");
    await db.update(user).set({ emailVerified: false }).where(eq(user.id, "bob"));
    expect(await code(inviteMember(db, "bob", teamId, { email: "x@example.com", role: "member" }, NOW))).toBe("EMAIL_NOT_VERIFIED");
    const { invitationId } = await inviteMember(db, "ada", teamId, { email: "x@example.com", role: "member" }, NOW);
    expect(await code(cancelInvitation(db, "cy", teamId, invitationId))).toBe("FORBIDDEN");
    await cancelInvitation(db, "ada", teamId, invitationId);
    expect(await listInvitations(db, "ada", teamId)).toEqual([]);
    expect(await code(cancelInvitation(db, "ada", teamId, invitationId))).toBe("INVITATION_NOT_FOUND");
  });

  it("an invitation grants no more than its sender still holds", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    await inviteMember(db, "bob", teamId, { email: "eve@example.com", role: "admin" }, NOW);
    await changeRole(db, "ada", teamId, "bob", "member");
    const [invite] = await listMyInvitations(db, { id: "eve", email: "eve@example.com", emailVerified: true }, NOW);
    await acceptInvitation(db, { id: "eve", email: "eve@example.com", emailVerified: true }, invite.id, NOW);
    const [row] = await db.select().from(membership).where(eq(membership.userId, "eve"));
    expect(row.role).toBe("member");
  });
});

describe("team event types (TEAM-001/004/008)", () => {
  beforeEach(async () => {
    await world(db);
  });

  it("lists, toggles and deletes; public pages skip templates, hidden and unbookable ones", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    const rr = await createTeamEventType(db, "ada", teamId, "round_robin", form());
    await createTeamEventType(db, "ada", teamId, "managed", form({ slug: "demo" }));
    await createTeamEventType(db, "ada", teamId, "collective", form({ slug: "secret", hidden: true }));
    expect((await listTeamEventTypes(db, "cy", teamId)).length).toBe(3);
    expect((await listPublicTeamEventTypes(db, teamId)).map((e) => e.slug)).toEqual(["intro"]);
    await setHosts(db, "ada", teamId, rr, rrHosts(["cy", "dee"]));
    expect((await findPublicTeamEventType(db, teamId, "intro"))?.hosts.map((h) => h.host.id)).toEqual(["cy", "dee"]);
    // An unverified pool host is skipped; an unverified fixed host makes it unbookable.
    await db.update(user).set({ emailVerified: false }).where(eq(user.id, "dee"));
    expect((await findPublicTeamEventType(db, teamId, "intro"))?.hosts.map((h) => h.host.id)).toEqual(["cy"]);
    await setHosts(db, "ada", teamId, rr, { hosts: [{ userId: "dee", isFixed: true, weight: 100, priority: 2 }], roundRobinWindowDays: 30 });
    expect(await findPublicTeamEventType(db, teamId, "intro")).toBeNull();

    expect(await code(setTeamEventTypeEnabled(db, "cy", teamId, rr, false))).toBe("FORBIDDEN");
    await setTeamEventTypeEnabled(db, "bob", teamId, rr, false);
    expect(await listPublicTeamEventTypes(db, teamId)).toEqual([]);
    expect(await code(deleteTeamEventType(db, "bob", teamId, rr, NOW))).toBe("OK");
    expect(await code(deleteTeamEventType(db, "bob", teamId, rr, NOW))).toBe("NOT_FOUND");
  });

  it("deleting the team or its event type is refused with upcoming bookings; member copies survive the team", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    const template = await createTeamEventType(db, "ada", teamId, "managed", form({ slug: "demo" }));
    await setManaged(db, "ada", teamId, template, { lockedFields: ["title"], assignees: ["cy"], now: NOW });
    const [copy] = await db.select().from(eventType).where(eq(eventType.parentId, template));
    const cy = (await resolveBookingTarget(db, { username: "cy", slug: "demo" }))!;
    await createBooking(db, { host: cy.host, eventType: cy.eventType, start: MON("10:00"), durationMin: 30, booker: booker(), guests: [], now: NOW });
    expect(await code(deleteTeamEventType(db, "ada", teamId, template, NOW))).toBe("FORBIDDEN:has_upcoming_bookings");

    const rr = await createTeamEventType(db, "ada", teamId, "round_robin", form());
    await setHosts(db, "ada", teamId, rr, rrHosts(["dee"]));
    await bookTeam("intro", MON("10:00"));
    expect(await code(deleteTeam(db, "ada", teamId, NOW))).toBe("FORBIDDEN:has_upcoming_bookings");
    await db.update(booking).set({ status: "cancelled" }).where(eq(booking.eventTypeId, rr));
    expect(await code(deleteTeam(db, "ada", teamId, NOW))).toBe("OK");
    // cy's copy (and its booking) is still there, detached and switched off.
    const [kept] = await db.select().from(eventType).where(eq(eventType.id, copy.id));
    expect(kept).toMatchObject({ parentId: null, enabled: false });
    expect((await db.select().from(booking).where(eq(booking.eventTypeId, copy.id))).length).toBe(1);
  });

  it("a duplicated managed copy is a plain event type, and copies get no extra reminder", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    const template = await createTeamEventType(db, "ada", teamId, "managed", form({ slug: "demo" }));
    await setManaged(db, "ada", teamId, template, { lockedFields: ["title"], assignees: ["cy", "cy"], now: NOW });
    const [copy] = await db.select().from(eventType).where(eq(eventType.parentId, template));
    expect(await db.select().from(workflow).where(eq(workflow.eventTypeId, copy.id))).toEqual([]);
    const dup = await duplicateEventType(db, "cy", copy.id);
    const [row] = await db.select().from(eventType).where(eq(eventType.id, dup));
    expect(row).toMatchObject({ parentId: null, teamId: null, slug: "demo-copy" });
    // Template edits still reach the copy (no slug clash with the duplicate).
    expect(await code(setManaged(db, "ada", teamId, template, { lockedFields: ["title", "durations"], assignees: ["cy"], now: NOW }))).toBe("OK");
  });

  it("assigning a member whose URL is taken fails without saving anything", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    await createEventType(db, "dee", form({ slug: "demo" }));
    const template = await createTeamEventType(db, "ada", teamId, "managed", form({ slug: "demo" }));
    expect(await code(setManaged(db, "ada", teamId, template, { lockedFields: ["title"], assignees: ["dee"], now: NOW }))).toBe("SLUG_TAKEN:dee");
    const [row] = await db.select().from(eventType).where(eq(eventType.id, template));
    expect(row.lockedFields).toEqual([]);
  });
});

describe("workflows and team resources are safe when people leave (NTF-007, ADM-006)", () => {
  beforeEach(async () => {
    await world(db);
  });

  it("team event types only take team workflows, managed by current admins", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    const et = await createTeamEventType(db, "bob", teamId, "collective", form());
    // The creator's personal workflow API can't attach to a team event type.
    expect(await code(createWorkflow(db, "bob", et, { ...DEFAULT_REMINDER, recipient: "address", address: "spy@example.com" }))).toBe("NOT_FOUND");
    const wf = await createTeamWorkflow(db, "bob", teamId, { ...DEFAULT_REMINDER, name: "Follow-up" });
    expect(await code(updateWorkflow(db, "ada", wf, { ...DEFAULT_REMINDER, name: "Renamed" }))).toBe("OK");
    expect(await code(setWorkflowEnabled(db, "cy", wf, false))).toBe("NOT_FOUND");
    await changeRole(db, "ada", teamId, "bob", "member");
    expect(await code(deleteWorkflow(db, "bob", wf))).toBe("NOT_FOUND");
    expect(await code(listTeamWorkflows(db, "bob", teamId))).toBe("FORBIDDEN");
    expect(await code(deleteWorkflow(db, "ada", wf))).toBe("OK");
  });

  it("deleting an account hands the team's event types, workflows and forms to the team", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    const et = await createTeamEventType(db, "bob", teamId, "round_robin", form());
    await setHosts(db, "bob", teamId, et, rrHosts(["cy", "dee"]));
    const created = await bookTeam("intro", MON("10:00"));
    await createTeamWorkflow(db, "bob", teamId, { ...DEFAULT_REMINDER, name: "Bob's" });
    await db.insert(routingForm).values({ id: "rf1", ownerUserId: "bob", teamId, name: "Qualify", fallback: { kind: "message", message: "Hi" } });

    await deleteAccount(db, "bob", NOW);
    const [kept] = await db.select().from(eventType).where(eq(eventType.id, et));
    expect(kept.ownerUserId).toBe("ada");
    expect((await db.select().from(booking).where(eq(booking.id, created.booking.id)))[0].status).toBe("accepted");
    expect((await db.select().from(workflow).where(eq(workflow.teamId, teamId))).map((w) => w.ownerUserId)).toEqual(["ada", "ada"]);
    expect((await db.select().from(routingForm).where(eq(routingForm.id, "rf1")))[0].ownerUserId).toBe("ada");
  });

  it("the last owner deleting their account promotes the next member; an empty team goes", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    await deleteAccount(db, "ada", NOW);
    const [bob] = await db.select().from(membership).where(eq(membership.userId, "bob"));
    expect(bob.role).toBe("owner");
    const solo = await createTeam(db, "eve", { name: "Solo", slug: "solo", logoUrl: null, brandColor: null });
    await deleteAccount(db, "eve", NOW);
    expect(await listMyTeams(db, "cy")).toMatchObject([{ id: teamId }]);
    expect(await code(getTeam(db, "cy", solo))).toBe("NOT_FOUND");
  });
});

describe("member removal edge cases (TEAM-002)", () => {
  beforeEach(async () => {
    await world(db);
  });

  it("a booking at its event type's daily limit can still move to another host", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    const et = await createTeamEventType(db, "ada", teamId, "round_robin", form({ bookingLimits: { day: 1 } }));
    await setHosts(db, "ada", teamId, et, { hosts: [{ userId: "cy", isFixed: false, weight: 100, priority: 4 }, { userId: "dee", isFixed: false, weight: 100, priority: 2 }], roundRobinWindowDays: 30 });
    const created = await bookTeam("intro", MON("10:00"));
    expect(created.booking.organizerId).toBe("cy");
    const result = await removeMember(db, { actorId: "ada", teamId, userId: "cy", futureBookings: "reassign", now: NOW }, noHooks);
    expect(result).toEqual({ cancelled: 0, reassigned: 1 });
    expect((await db.select().from(booking).where(eq(booking.id, created.booking.id)))[0].organizerId).toBe("dee");
  });

  it("pending requests change hands quietly (no confirmation email for an unconfirmed booking)", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    const et = await createTeamEventType(db, "ada", teamId, "round_robin", form({ requiresConfirmation: true }));
    await setHosts(db, "ada", teamId, et, { hosts: [{ userId: "cy", isFixed: false, weight: 100, priority: 4 }, { userId: "dee", isFixed: false, weight: 100, priority: 2 }], roundRobinWindowDays: 30 });
    const created = await bookTeam("intro", MON("10:00"));
    expect(created.booking.status).toBe("pending");
    const reassigned: string[] = [];
    await removeMember(db, { actorId: "ada", teamId, userId: "cy", futureBookings: "reassign", now: NOW }, { ...noHooks, onReassigned: async (_tx, row) => void reassigned.push(row.id) });
    expect(reassigned).toEqual([]);
    expect((await db.select().from(booking).where(eq(booking.id, created.booking.id)))[0]).toMatchObject({ organizerId: "dee", status: "pending" });
  });

  it("a removed host can't be booked anymore, even by a stale page", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    const et = await createTeamEventType(db, "ada", teamId, "round_robin", form());
    await setHosts(db, "ada", teamId, et, rrHosts(["cy"]));
    const stale = (await resolveBookingTarget(db, { team: "acme", slug: "intro" }))!;
    await removeMember(db, { actorId: "ada", teamId, userId: "cy", futureBookings: "cancel", now: NOW }, noHooks);
    await expect(
      createBooking(db, { host: stale.host, hosts: stale.hosts, eventType: stale.eventType, start: MON("10:00"), durationMin: 30, booker: booker(), guests: [], now: NOW }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });
});

describe("troubleshooter for team admins (AVL-008)", () => {
  beforeEach(async () => {
    await world(db);
  });

  it("admins see their teams' event types; a member's other meetings show without titles", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    const et = await createTeamEventType(db, "ada", teamId, "round_robin", form());
    await setHosts(db, "ada", teamId, et, rrHosts(["cy"]));
    expect((await troubleshootableTeamEventTypes(db, "bob")).map((e) => e.id)).toEqual([et]);
    expect(await troubleshootableTeamEventTypes(db, "cy")).toEqual([]);
    // cy has a private meeting at 10:00.
    await createEventType(db, "cy", form({ title: "Therapy", slug: "own" }));
    const own = (await resolveBookingTarget(db, { username: "cy", slug: "own" }))!;
    await createBooking(db, { host: own.host, eventType: own.eventType, start: MON("10:00"), durationMin: 30, booker: booker(), guests: [], now: NOW });
    const [teamType] = await troubleshootableTeamEventTypes(db, "bob");
    const result = await explainDay(db, { host: own.host, eventType: teamType, date: "2026-10-05", now: NOW, scheduleId: null, revealSources: false });
    const ten = result.slots.find((s) => s.start === MON("10:00"))!;
    expect(ten).toMatchObject({ status: "booking_conflict" });
    expect(ten.source).toBeUndefined();
    expect(result.slots.find((s) => s.start === MON("08:00"))).toMatchObject({ status: "outside_working_hours", source: "Schedule “Working hours”" });
  });
});

describe("team availability view (TEAM-010)", () => {
  beforeEach(async () => {
    await world(db);
  });

  it("shows members' working hours and busy blocks, without meeting details", async () => {
    const teamId = (await listMyTeams(db, "ada"))[0].id;
    const et = await createTeamEventType(db, "ada", teamId, "collective", form());
    await setHosts(db, "ada", teamId, et, { hosts: [{ userId: "cy", isFixed: true, weight: 100, priority: 2 }], roundRobinWindowDays: 30 });
    await bookTeam("intro", MON("10:00"));
    const day = { start: MON("00:00"), end: MON("00:00") + 86_400_000 };
    expect(await code(teamAvailability(db, "eve", teamId, day))).toBe("NOT_FOUND");
    const view = await teamAvailability(db, "dee", teamId, day, () => async () => [{ start: MON("15:00"), end: MON("16:00"), ref: "secret-calendar" }]);
    const cy = view.find((m) => m.userId === "cy")!;
    expect(cy.working).toEqual([{ start: MON("09:00"), end: MON("17:00") }]);
    expect(cy.busy).toEqual([
      { start: MON("10:00"), end: MON("10:30") },
      { start: MON("15:00"), end: MON("16:00") },
    ]);
    expect(Object.keys(cy.busy[0])).toEqual(["start", "end"]);
    expect(view.map((m) => m.name).toSorted()).toEqual(["Ada", "Bob", "Cy", "Dee"]);
  });
});
