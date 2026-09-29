import { and, asc, count, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { booking, bookingHost, eventType, membership, user, webhook } from "@/db/schema";
import { ACTIVE } from "@/features/bookings/server/core";
import { atLeast, requireTeamRole, type TeamRole } from "./access";
import { listMyTeams, membersOf } from "./service";

/** Read-only numbers for the Teams overview page: team cards and the members table. */

type Window = { start: number; end: number };

export type TeamCard = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: TeamRole;
  /** Member names, alphabetical (for the avatar stack and the count). */
  memberNames: string[];
  eventTypes: number;
  /** Active bookings of the team's event types starting in the week window. */
  weekBookings: number;
  /** Team webhooks; null for plain members, who can't see them. */
  webhooks: number | null;
};

const byTeam = (rows: { teamId: string | null; n: number }[]) => new Map(rows.map((r) => [r.teamId, r.n]));

/** Every team the user belongs to, with its card numbers. */
export async function loadTeamCards(db: Database, userId: string, week: Window): Promise<TeamCard[]> {
  const teams = await listMyTeams(db, userId);
  if (teams.length === 0) return [];
  const ids = teams.map((t) => t.id);
  const managed = teams.filter((t) => atLeast(t.role, "admin")).map((t) => t.id);
  const [members, types, bookings, hooks] = await Promise.all([
    db
      .select({ teamId: membership.teamId, name: user.name })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(inArray(membership.teamId, ids))
      .orderBy(asc(user.name)),
    db
      .select({ teamId: eventType.teamId, n: count() })
      .from(eventType)
      .where(and(inArray(eventType.teamId, ids), isNull(eventType.parentId)))
      .groupBy(eventType.teamId),
    db
      .select({ teamId: eventType.teamId, n: count() })
      .from(booking)
      .innerJoin(eventType, eq(eventType.id, booking.eventTypeId))
      .where(
        and(
          inArray(eventType.teamId, ids),
          inArray(booking.status, [...ACTIVE]),
          gte(booking.startAt, new Date(week.start)),
          lt(booking.startAt, new Date(week.end)),
        ),
      )
      .groupBy(eventType.teamId),
    managed.length
      ? db.select({ teamId: webhook.teamId, n: count() }).from(webhook).where(inArray(webhook.teamId, managed)).groupBy(webhook.teamId)
      : Promise.resolve([]),
  ]);
  const typeCounts = byTeam(types);
  const bookingCounts = byTeam(bookings);
  const hookCounts = byTeam(hooks);
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    logoUrl: t.logoUrl,
    role: t.role,
    memberNames: members.filter((m) => m.teamId === t.id).map((m) => m.name),
    eventTypes: typeCounts.get(t.id) ?? 0,
    weekBookings: bookingCounts.get(t.id) ?? 0,
    webhooks: atLeast(t.role, "admin") ? (hookCounts.get(t.id) ?? 0) : null,
  }));
}

export type MemberActivity = {
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
  /** Accepted bookings the member hosts (any event type) starting today / this week. */
  today: number;
  week: number;
};

/**
 * The members table (admins and owners only): each member's accepted bookings today and this
 * week, in the viewer's time zone. A simple count; free/busy is on the availability page.
 */
export async function loadMemberActivity(
  db: Database,
  actorId: string,
  teamId: string,
  windows: { today: Window; week: Window },
): Promise<MemberActivity[]> {
  await requireTeamRole(db, actorId, teamId, "admin");
  const members = await membersOf(db, teamId);
  if (members.length === 0) return [];
  const { today, week } = windows;
  const from = new Date(Math.min(today.start, week.start));
  const to = new Date(Math.max(today.end, week.end));
  const inRange = (w: Window) => sql`${booking.startAt} >= ${new Date(w.start)} AND ${booking.startAt} < ${new Date(w.end)}`;
  const rows = await db
    .select({
      userId: bookingHost.userId,
      today: sql<number>`count(*) FILTER (WHERE ${inRange(today)})`.mapWith(Number),
      week: sql<number>`count(*) FILTER (WHERE ${inRange(week)})`.mapWith(Number),
    })
    .from(booking)
    .innerJoin(bookingHost, eq(bookingHost.bookingId, booking.id))
    .where(
      and(
        inArray(bookingHost.userId, members.map((m) => m.userId)),
        eq(bookingHost.active, true),
        eq(booking.status, "accepted"),
        gte(booking.startAt, from),
        lt(booking.startAt, to),
      ),
    )
    .groupBy(bookingHost.userId);
  const counts = new Map(rows.map((r) => [r.userId, r]));
  return members.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    role: m.role,
    today: counts.get(m.userId)?.today ?? 0,
    week: counts.get(m.userId)?.week ?? 0,
  }));
}
