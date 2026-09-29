import { and, asc, count, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import { booking, eventType, eventTypeHost, membership, team, user } from "@/db/schema";
import { ACTIVE, isHostOf } from "@/features/bookings/server/core";
import { weekWindow } from "@/features/dashboard/overview";
import { atLeast, type TeamRole } from "@/features/teams/roles";

/**
 * Lean queries for the event types list page: this week's bookings per event type and the team
 * event types of the host's teams. Both are scoped to the signed-in user.
 */

/** Active bookings the host attends this week (in their time zone), keyed by event type id. */
export async function countWeekBookings(
  db: Database,
  hostId: string,
  options: { now: number; timeZone: string; weekStart: number },
): Promise<Record<string, number>> {
  const window = weekWindow(options.now, options.timeZone, options.weekStart);
  const rows = await db
    .select({ eventTypeId: booking.eventTypeId, n: count() })
    .from(booking)
    .where(
      and(
        isHostOf(hostId),
        inArray(booking.status, [...ACTIVE]),
        gte(booking.startAt, new Date(window.start)),
        lt(booking.startAt, new Date(window.end)),
      ),
    )
    .groupBy(booking.eventTypeId);
  return Object.fromEntries(rows.map((r) => [r.eventTypeId, r.n]));
}

export type MyTeamEventType = {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  schedulingType: "collective" | "round_robin" | "managed";
  durationMinutes: number;
  enabled: boolean;
  /** Admins and owners can open the event type; members get the team page. */
  canEdit: boolean;
  isHost: boolean;
  hosts: string[];
};

/** Team event types of every team the user belongs to, by team name then the team's order. */
export async function listMyTeamEventTypes(db: Database, userId: string): Promise<MyTeamEventType[]> {
  const rows = await db
    .select({
      id: eventType.id,
      teamId: team.id,
      teamName: team.name,
      title: eventType.title,
      schedulingType: eventType.schedulingType,
      durationMinutes: eventType.durationMinutes,
      enabled: eventType.enabled,
      role: membership.role,
    })
    .from(eventType)
    .innerJoin(team, eq(team.id, eventType.teamId))
    .innerJoin(membership, and(eq(membership.teamId, eventType.teamId), eq(membership.userId, userId)))
    .where(isNotNull(eventType.teamId))
    .orderBy(asc(team.name), asc(eventType.position), asc(eventType.createdAt));
  const ids = rows.map((r) => r.id);
  const hosts = ids.length
    ? await db
        .select({ eventTypeId: eventTypeHost.eventTypeId, userId: user.id, name: user.name })
        .from(eventTypeHost)
        .innerJoin(user, eq(user.id, eventTypeHost.userId))
        .where(inArray(eventTypeHost.eventTypeId, ids))
        .orderBy(asc(eventTypeHost.position))
    : [];
  return rows.map(({ role, schedulingType, ...r }) => {
    const mine = hosts.filter((h) => h.eventTypeId === r.id);
    return {
      ...r,
      schedulingType: schedulingType ?? "collective",
      canEdit: atLeast(role as TeamRole, "admin"),
      isHost: mine.some((h) => h.userId === userId),
      hosts: mine.map((h) => h.name),
    };
  });
}
