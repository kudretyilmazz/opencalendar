import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Database, Tx } from "@/db/client";
import { eventType, membership, routingForm, team, teamInvitation, webhook, workflow } from "@/db/schema";

/**
 * Team resources record their creator in `owner_user_id`, which cascades when that user is
 * deleted. When a member leaves (TEAM-002) or deletes their account (ADM-006), everything they
 * created for the team is handed to a remaining member, so the team's event types, bookings,
 * workflows, webhooks and routing forms survive. Personal workflows the leaver had put on the team's event
 * types (possible before team workflows existed) are removed: they would keep mailing booking
 * data to someone outside the team.
 */

const RANK = { owner: 0, admin: 1, member: 2 } as const;

/** The remaining member with the highest role (oldest first), or null when nobody is left. */
export async function successorFor(tx: Database | Tx, teamId: string, leavingUserId: string) {
  const rows = await tx
    .select({ userId: membership.userId, role: membership.role })
    .from(membership)
    .where(and(eq(membership.teamId, teamId), ne(membership.userId, leavingUserId)))
    .orderBy(asc(membership.createdAt));
  return rows.toSorted((a, b) => RANK[a.role] - RANK[b.role])[0] ?? null;
}

export async function handOver(tx: Tx, teamId: string, fromUserId: string, toUserId: string): Promise<void> {
  const teamTypes = tx.select({ id: eventType.id }).from(eventType).where(eq(eventType.teamId, teamId));
  await tx.update(eventType).set({ ownerUserId: toUserId }).where(and(eq(eventType.teamId, teamId), eq(eventType.ownerUserId, fromUserId)));
  await tx.update(workflow).set({ ownerUserId: toUserId }).where(and(eq(workflow.teamId, teamId), eq(workflow.ownerUserId, fromUserId)));
  await tx.update(routingForm).set({ ownerUserId: toUserId }).where(and(eq(routingForm.teamId, teamId), eq(routingForm.ownerUserId, fromUserId)));
  await tx.update(webhook).set({ ownerUserId: toUserId }).where(and(eq(webhook.teamId, teamId), eq(webhook.ownerUserId, fromUserId)));
  await tx.delete(workflow).where(and(eq(workflow.ownerUserId, fromUserId), inArray(workflow.eventTypeId, teamTypes)));
  // Invitations they sent carry their authority: they go too (M4 review).
  await tx.delete(teamInvitation).where(and(eq(teamInvitation.teamId, teamId), eq(teamInvitation.invitedBy, fromUserId)));
}

/**
 * Account deletion: leave every team. The last owner's place goes to the next member (promoted
 * to owner); a team with nobody left is deleted with its resources.
 */
export async function leaveAllTeams(db: Database, userId: string): Promise<void> {
  const teams = await db.select({ teamId: membership.teamId, role: membership.role }).from(membership).where(eq(membership.userId, userId));
  for (const { teamId, role } of teams) {
    await db.transaction(async (tx) => {
      const next = await successorFor(tx, teamId, userId);
      if (!next) {
        await tx.delete(team).where(eq(team.id, teamId));
        return;
      }
      if (role === "owner") {
        const [otherOwner] = await tx
          .select({ userId: membership.userId })
          .from(membership)
          .where(and(eq(membership.teamId, teamId), eq(membership.role, "owner"), ne(membership.userId, userId)));
        if (!otherOwner) await tx.update(membership).set({ role: "owner" }).where(and(eq(membership.teamId, teamId), eq(membership.userId, next.userId)));
      }
      await handOver(tx, teamId, userId, next.userId);
      await tx.delete(membership).where(and(eq(membership.teamId, teamId), eq(membership.userId, userId)));
    });
  }
}
