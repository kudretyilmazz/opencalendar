import { and, count, eq, gt, gte, inArray, sql } from "drizzle-orm";
import type { Database, Tx } from "@/db/client";
import { booking, bookingHost, eventType, eventTypeHost, membership, user } from "@/db/schema";
import { ACTIVE, type BookingRow, deactivate, lockHosts, MIN } from "@/features/bookings/server/core";
import { loadHostInput } from "@/features/bookings/server/host-data";
import { refreshDisplay } from "@/features/bookings/server/host-data";
import { toEngineEvent } from "@/features/event-types/server/service";
import { scheduleForEventType, toScheduleInput } from "@/features/schedules/server/service";
import { isSlotAvailable, selectRoundRobinHost } from "@/lib/availability";
import { atLeast, TeamError } from "./access";
import { detachCopies } from "./event-types";
import { handOver, successorFor } from "./handover";
import { lockMembers } from "./service";

/**
 * Removing a member (TEAM-002, TEAM-003). The admin chooses what happens to the member's future
 * bookings of team event types:
 *
 * - `cancel`: they are cancelled (attendees are emailed through the booking job);
 * - `reassign`: a round-robin booking goes to another pool host who is free then (picked like a
 *   new booking), a collective booking simply continues without them. When nobody is free, the
 *   booking is cancelled instead.
 *
 * Reassignment checks each candidate's schedule and bookings, not their external calendars (those
 * need network I/O, which never runs under the host locks).
 */

export type RemovalHooks = {
  onCancelled: (tx: Tx, row: BookingRow) => Promise<void>;
  onReassigned: (tx: Tx, row: BookingRow) => Promise<void>;
};

export type RemovalResult = { cancelled: number; reassigned: number };

const CANCEL_REASON = "The host is no longer available.";

async function futureTeamBookings(tx: Tx, teamId: string, userId: string, now: number) {
  return tx
    .select({ booking })
    .from(booking)
    .innerJoin(bookingHost, and(eq(bookingHost.bookingId, booking.id), eq(bookingHost.userId, userId), eq(bookingHost.active, true)))
    .innerJoin(eventType, eq(eventType.id, booking.eventTypeId))
    .where(and(eq(eventType.teamId, teamId), inArray(booking.status, [...ACTIVE]), gt(booking.endAt, new Date(now))))
    .orderBy(booking.startAt)
    .for("update", { of: booking });
}

async function cancelOne(tx: Tx, row: BookingRow, now: number, hooks: RemovalHooks) {
  await deactivate(tx, row.id);
  const [next] = await tx
    .update(booking)
    .set({ status: "cancelled", manageTokenSealed: null, cancelledBy: "host", cancellationReason: CANCEL_REASON, cancelledAt: new Date(now), sequence: row.sequence + 1 })
    .where(eq(booking.id, row.id))
    .returning();
  await hooks.onCancelled(tx, next);
}

/** A free round-robin pool host for the booking's exact time, or null. */
async function replacementFor(tx: Tx, row: BookingRow, leaving: string, now: number) {
  const [et] = await tx.select().from(eventType).where(eq(eventType.id, row.eventTypeId));
  if (!et || et.schedulingType !== "round_robin") return null;
  const pool = await tx
    .select({ userId: eventTypeHost.userId, weight: eventTypeHost.weight, priority: eventTypeHost.priority, scheduleId: eventTypeHost.scheduleId, name: user.name })
    .from(eventTypeHost)
    .innerJoin(user, eq(user.id, eventTypeHost.userId))
    .where(and(eq(eventTypeHost.eventTypeId, et.id), eq(eventTypeHost.isFixed, false), sql`${eventTypeHost.userId} <> ${leaving}`));
  if (!pool.length) return null;
  const slot = { start: row.startAt.getTime(), end: row.endAt.getTime() };
  const engineEvent = { ...toEngineEvent(et, (slot.end - slot.start) / MIN), minNoticeMin: 0 };
  const free = [];
  for (const p of pool) {
    const sched = await scheduleForEventType(tx, p.userId, p.scheduleId);
    if (!sched) continue;
    const input = await loadHostInput(tx, { hostId: p.userId, schedule: toScheduleInput(sched), window: slot, now, eventType: { id: et.id, limits: engineEvent.limits } });
    // The booking being moved must not count against its own limits.
    if (isSlotAvailable(engineEvent, input, slot, { now, rescheduleUid: row.uid }).ok) free.push(p);
  }
  if (!free.length) return null;
  const counts = await tx
    .select({ organizerId: booking.organizerId, n: count() })
    .from(booking)
    .where(
      and(
        eq(booking.eventTypeId, et.id),
        inArray(booking.organizerId, free.map((f) => f.userId)),
        inArray(booking.status, [...ACTIVE]),
        gte(booking.startAt, new Date(now - et.roundRobinWindowDays * 24 * 60 * MIN)),
      ),
    )
    .groupBy(booking.organizerId);
  return selectRoundRobinHost(
    free.map((f) => ({ userId: f.userId, name: f.name, weight: f.weight, priority: f.priority, recentBookings: counts.find((c) => c.organizerId === f.userId)?.n ?? 0 })),
    et.roundRobinWindowDays,
  );
}

async function reassignOne(tx: Tx, row: BookingRow, leaving: string, now: number, hooks: RemovalHooks): Promise<boolean> {
  const hosts = await tx.select().from(bookingHost).where(eq(bookingHost.bookingId, row.id));
  const others = hosts.filter((h) => h.userId !== leaving);
  const mine = hosts.find((h) => h.userId === leaving)!;
  if (row.organizerId !== leaving) {
    // A collective co-host leaves: the meeting goes on with the others.
    await tx.delete(bookingHost).where(and(eq(bookingHost.bookingId, row.id), eq(bookingHost.userId, leaving)));
    return true;
  }
  const replacement = await replacementFor(tx, row, leaving, now);
  const organizer = replacement?.userId ?? (others.length ? others[0].userId : null);
  if (!organizer) return false;
  await tx.delete(bookingHost).where(and(eq(bookingHost.bookingId, row.id), eq(bookingHost.userId, leaving)));
  if (replacement) {
    // The exclusion constraint still guards against a double booking here.
    await tx.insert(bookingHost).values({ bookingId: row.id, userId: replacement.userId, blockedStart: mine.blockedStart, blockedEnd: mine.blockedEnd, active: true });
  }
  const [next] = await tx
    .update(booking)
    .set({
      organizerId: organizer,
      sequence: row.sequence + 1,
      assignmentReason: replacement ? `Reassigned after the previous host left the team. ${replacement.reason}` : row.assignmentReason,
    })
    .where(eq(booking.id, row.id))
    .returning();
  // Pending requests just change hands: the new host finds them under "Unconfirmed" and the
  // attendee's request stands; confirmed meetings get emails and move calendars.
  if (next.status === "accepted") await hooks.onReassigned(tx, next);
  return true;
}

export async function removeMember(
  db: Database,
  input: { actorId: string; teamId: string; userId: string; futureBookings: "reassign" | "cancel"; now: number },
  hooks: RemovalHooks,
): Promise<RemovalResult> {
  const leavingSelf = input.actorId === input.userId;
  return refreshDisplay(db.transaction(async (tx) => {
    // Roles are read under the lock, so a concurrent demotion can't slip in between.
    const members = await lockMembers(tx, input.teamId);
    const actorRole = members.find((m) => m.userId === input.actorId)?.role;
    if (!actorRole) throw new TeamError("NOT_FOUND");
    if (!leavingSelf && !atLeast(actorRole, "admin")) throw new TeamError("FORBIDDEN");
    const target = members.find((m) => m.userId === input.userId);
    if (!target) throw new TeamError("MEMBER_NOT_FOUND");
    if (target.role === "owner" && !leavingSelf && actorRole !== "owner") throw new TeamError("FORBIDDEN");
    if (target.role === "owner" && members.filter((m) => m.role === "owner").length === 1) throw new TeamError("LAST_OWNER");

    // Host locks before any booking row lock: the same order as booking and rescheduling, so a
    // concurrent reschedule can't deadlock with this, and no new booking for the leaver slips in.
    const teamHosts = await tx
      .select({ userId: eventTypeHost.userId })
      .from(eventTypeHost)
      .innerJoin(eventType, eq(eventType.id, eventTypeHost.eventTypeId))
      .where(eq(eventType.teamId, input.teamId));
    await lockHosts(tx, [input.userId, ...teamHosts.map((h) => h.userId)]);
    const result = { cancelled: 0, reassigned: 0 };
    for (const { booking: row } of await futureTeamBookings(tx, input.teamId, input.userId, input.now)) {
      if (input.futureBookings === "reassign" && (await reassignOne(tx, row, input.userId, input.now, hooks))) result.reassigned += 1;
      else {
        await cancelOne(tx, row, input.now, hooks);
        result.cancelled += 1;
      }
    }
    // Whatever they created for the team stays with the team (the actor, or the next member).
    const heir = leavingSelf ? (await successorFor(tx, input.teamId, input.userId))?.userId : input.actorId;
    if (heir) await handOver(tx, input.teamId, input.userId, heir);
    const teamTypes = tx.select({ id: eventType.id }).from(eventType).where(eq(eventType.teamId, input.teamId));
    await tx.delete(eventTypeHost).where(and(eq(eventTypeHost.userId, input.userId), inArray(eventTypeHost.eventTypeId, teamTypes)));
    // Their copies of managed event types stay as plain personal event types.
    await detachCopies(tx, and(eq(eventType.ownerUserId, input.userId), inArray(eventType.parentId, teamTypes)));
    await tx.delete(membership).where(and(eq(membership.teamId, input.teamId), eq(membership.userId, input.userId)));
    return result;
  }));
}
