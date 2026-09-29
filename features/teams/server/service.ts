import { and, asc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import type { Database, Tx } from "@/db/client";
import { booking, eventType, membership, team, teamInvitation, user, workflow } from "@/db/schema";
import { DEFAULT_REMINDER } from "@/features/workflows/schemas";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { newId } from "@/lib/ids";
import type { TeamForm } from "../schemas";
import { atLeast, requireTeamRole, roleIn, TeamError, type TeamRole } from "./access";
import { hitAccountLimit } from "@/lib/auth/lockout";
import { detachCopies } from "./event-types";

/** Teams, members and invitations (TEAM-001…003). Every function checks the caller's role. */

export type TeamRow = typeof team.$inferSelect;
export type TeamMember = { userId: string; name: string; email: string; username: string | null; role: TeamRole };
export type TeamInvitationRow = typeof teamInvitation.$inferSelect;

export const INVITATION_TTL_MS = 14 * 24 * 3_600_000;
/** Anti-abuse (M4 review): invitations are emails sent from this instance's trusted sender. */
export const INVITE_LIMIT = { windowMs: 3_600_000, max: 30 };
export const MAX_PENDING_INVITATIONS = 100;

/** Team creation and invitations need a verified email (no relay for throwaway accounts). */
async function assertVerified(db: Database | Tx, userId: string) {
  const [row] = await db.select({ verified: user.emailVerified }).from(user).where(eq(user.id, userId));
  if (!row?.verified) throw new TeamError("EMAIL_NOT_VERIFIED");
}

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505";

export async function createTeam(db: Database, userId: string, input: TeamForm): Promise<string> {
  await assertVerified(db, userId);
  const id = newId();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(team).values({ id, ...input });
      await tx.insert(membership).values({ teamId: id, userId, role: "owner" });
      // NTF-006/007: teams start with the 24-hour reminder for all their event types.
      await tx.insert(workflow).values({ id: newId(), ownerUserId: userId, teamId: id, ...DEFAULT_REMINDER, isDefault: true });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new TeamError("SLUG_TAKEN");
    throw error;
  }
  await ensureScheduleFor(db, userId);
  return id;
}

export async function updateTeam(db: Database, actorId: string, teamId: string, input: TeamForm): Promise<void> {
  await requireTeamRole(db, actorId, teamId, "admin");
  try {
    await db.update(team).set(input).where(eq(team.id, teamId));
  } catch (error) {
    if (isUniqueViolation(error)) throw new TeamError("SLUG_TAKEN");
    throw error;
  }
}

/**
 * Owners only (TEAM-003). Refused while team event types have upcoming bookings (they'd cascade).
 * Members' managed copies are personal event types: they are detached and kept, bookings and all.
 * The team's event types are row-locked first, so a booking can't be added between check and delete.
 */
export async function deleteTeam(db: Database, actorId: string, teamId: string, now: number): Promise<void> {
  await requireTeamRole(db, actorId, teamId, "owner");
  await db.transaction(async (tx) => {
    const types = await tx.select({ id: eventType.id }).from(eventType).where(eq(eventType.teamId, teamId)).for("update");
    const ids = types.map((t) => t.id);
    if (ids.length) {
      const [upcoming] = await tx
        .select({ id: booking.id })
        .from(booking)
        .where(and(inArray(booking.eventTypeId, ids), inArray(booking.status, ["accepted", "pending", "awaiting_payment"]), gte(booking.endAt, new Date(now))))
        .limit(1);
      if (upcoming) throw new TeamError("FORBIDDEN", "has_upcoming_bookings");
      await detachCopies(tx, inArray(eventType.parentId, ids));
    }
    await tx.delete(team).where(eq(team.id, teamId));
  });
}

export async function listMyTeams(db: Database, userId: string): Promise<(TeamRow & { role: TeamRole })[]> {
  const rows = await db
    .select({ team, role: membership.role })
    .from(membership)
    .innerJoin(team, eq(team.id, membership.teamId))
    .where(eq(membership.userId, userId))
    .orderBy(asc(team.name));
  return rows.map((r) => ({ ...r.team, role: r.role }));
}

export async function getTeam(db: Database, actorId: string, teamId: string): Promise<TeamRow & { role: TeamRole }> {
  const role = await requireTeamRole(db, actorId, teamId, "member");
  const [row] = await db.select().from(team).where(eq(team.id, teamId));
  if (!row) throw new TeamError("NOT_FOUND");
  return { ...row, role };
}

/** Members, for any member of the team. */
export async function listMembers(db: Database, actorId: string, teamId: string): Promise<TeamMember[]> {
  await requireTeamRole(db, actorId, teamId, "member");
  return membersOf(db, teamId);
}

export async function membersOf(db: Database | Tx, teamId: string): Promise<TeamMember[]> {
  return db
    .select({ userId: user.id, name: user.name, email: user.email, username: user.username, role: membership.role })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.teamId, teamId))
    .orderBy(asc(user.name));
}

/** Pending invitations, for admins. */
export async function listInvitations(db: Database, actorId: string, teamId: string): Promise<TeamInvitationRow[]> {
  await requireTeamRole(db, actorId, teamId, "admin");
  return db.select().from(teamInvitation).where(eq(teamInvitation.teamId, teamId)).orderBy(asc(teamInvitation.createdAt));
}

/**
 * TEAM-002: admins invite by email; only owners may invite owners. Re-inviting refreshes the
 * role and expiry. Returns what the invitation email needs.
 */
export async function inviteMember(
  db: Database,
  actorId: string,
  teamId: string,
  input: { email: string; role: TeamRole },
  now: number,
): Promise<{ invitationId: string; teamName: string; inviterName: string }> {
  const role = await requireTeamRole(db, actorId, teamId, "admin");
  if (input.role === "owner" && role !== "owner") throw new TeamError("FORBIDDEN");
  await assertVerified(db, actorId);
  if (await hitAccountLimit(db, { key: `team-invite:${actorId}`, ...INVITE_LIMIT, now: new Date(now) })) throw new TeamError("RATE_LIMITED");
  const pending = await db.$count(teamInvitation, eq(teamInvitation.teamId, teamId));
  if (pending >= MAX_PENDING_INVITATIONS) throw new TeamError("RATE_LIMITED");
  const email = input.email.toLowerCase();
  const [existing] = await db
    .select({ userId: membership.userId })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.teamId, teamId), sql`lower(${user.email}) = ${email}`));
  if (existing) throw new TeamError("ALREADY_MEMBER");
  const [row] = await db
    .insert(teamInvitation)
    .values({ id: newId(), teamId, email, role: input.role, invitedBy: actorId, expiresAt: new Date(now + INVITATION_TTL_MS) })
    .onConflictDoUpdate({
      target: [teamInvitation.teamId, teamInvitation.email],
      set: { role: input.role, invitedBy: actorId, expiresAt: new Date(now + INVITATION_TTL_MS) },
    })
    .returning({ id: teamInvitation.id });
  const [[t], [inviter]] = await Promise.all([
    db.select({ name: team.name }).from(team).where(eq(team.id, teamId)),
    db.select({ name: user.name }).from(user).where(eq(user.id, actorId)),
  ]);
  return { invitationId: row.id, teamName: t.name, inviterName: inviter.name };
}

export async function cancelInvitation(db: Database, actorId: string, teamId: string, invitationId: string): Promise<void> {
  await requireTeamRole(db, actorId, teamId, "admin");
  const deleted = await db
    .delete(teamInvitation)
    .where(and(eq(teamInvitation.id, invitationId), eq(teamInvitation.teamId, teamId)))
    .returning({ id: teamInvitation.id });
  if (!deleted.length) throw new TeamError("INVITATION_NOT_FOUND");
}

type Invitee = { id: string; email: string; emailVerified: boolean };

/** Open invitations addressed to the signed-in user's email, with who sent them (if still around). */
export async function listMyInvitations(db: Database, invitee: Invitee, now: number) {
  return db
    .select({
      id: teamInvitation.id,
      role: teamInvitation.role,
      teamId: team.id,
      teamName: team.name,
      expiresAt: teamInvitation.expiresAt,
      inviterName: user.name,
    })
    .from(teamInvitation)
    .innerJoin(team, eq(team.id, teamInvitation.teamId))
    .leftJoin(user, eq(user.id, teamInvitation.invitedBy))
    .where(and(eq(teamInvitation.email, invitee.email.toLowerCase()), gt(teamInvitation.expiresAt, new Date(now))))
    .orderBy(asc(team.name));
}

async function ownInvitation(tx: Database | Tx, invitee: Invitee, invitationId: string, now: number) {
  const [row] = await tx
    .select()
    .from(teamInvitation)
    .where(and(eq(teamInvitation.id, invitationId), eq(teamInvitation.email, invitee.email.toLowerCase()), gt(teamInvitation.expiresAt, new Date(now))))
    .for("update");
  if (!row) throw new TeamError("INVITATION_NOT_FOUND");
  return row;
}

/** Only a verified owner of the invited address can accept: nobody can claim someone else's invite. */
export async function acceptInvitation(db: Database, invitee: Invitee, invitationId: string, now: number): Promise<string> {
  if (!invitee.emailVerified) throw new TeamError("EMAIL_NOT_VERIFIED");
  const teamId = await db.transaction(async (tx) => {
    const invite = await ownInvitation(tx, invitee, invitationId, now);
    // An invitation grants no more than its sender still holds (a demoted or departed inviter).
    const inviterRole = invite.invitedBy ? await roleIn(tx, invite.invitedBy, invite.teamId) : null;
    const role = inviterRole && atLeast(inviterRole, invite.role) ? invite.role : "member";
    await tx.insert(membership).values({ teamId: invite.teamId, userId: invitee.id, role }).onConflictDoNothing();
    await tx.delete(teamInvitation).where(eq(teamInvitation.id, invite.id));
    return invite.teamId;
  });
  await ensureScheduleFor(db, invitee.id);
  return teamId;
}

/** Team hosts use their default schedule; members who never opened Availability get one. */
async function ensureScheduleFor(db: Database, userId: string) {
  const [row] = await db.select({ timeZone: user.timeZone }).from(user).where(eq(user.id, userId));
  await ensureDefaultSchedule(db, userId, row?.timeZone ?? "UTC");
}

export async function declineInvitation(db: Database, invitee: Invitee, invitationId: string, now: number): Promise<void> {
  await db.transaction(async (tx) => {
    const invite = await ownInvitation(tx, invitee, invitationId, now);
    await tx.delete(teamInvitation).where(eq(teamInvitation.id, invite.id));
  });
}

/** Locks the team's memberships so owner counts can't race (two owners demoting each other). */
export async function lockMembers(tx: Tx, teamId: string) {
  return tx.select({ userId: membership.userId, role: membership.role }).from(membership).where(eq(membership.teamId, teamId)).for("update");
}

/**
 * TEAM-003: admins switch members between member and admin; granting or removing the owner role
 * is for owners only, and the last owner can't be demoted.
 */
export async function changeRole(db: Database, actorId: string, teamId: string, targetId: string, role: TeamRole): Promise<void> {
  await db.transaction(async (tx) => {
    const members = await lockMembers(tx, teamId);
    const actorRole = members.find((m) => m.userId === actorId)?.role;
    if (!actorRole) throw new TeamError("NOT_FOUND");
    if (!atLeast(actorRole, "admin")) throw new TeamError("FORBIDDEN");
    const target = members.find((m) => m.userId === targetId);
    if (!target) throw new TeamError("MEMBER_NOT_FOUND");
    if ((target.role === "owner" || role === "owner") && actorRole !== "owner") throw new TeamError("FORBIDDEN");
    if (target.role === "owner" && role !== "owner" && members.filter((m) => m.role === "owner").length === 1) throw new TeamError("LAST_OWNER");
    await tx.update(membership).set({ role }).where(and(eq(membership.teamId, teamId), eq(membership.userId, targetId)));
  });
}
