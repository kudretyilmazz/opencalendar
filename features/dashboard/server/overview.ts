import { and, asc, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { attendee, booking, eventType, team } from "@/db/schema";
import { ACTIVE, isHostOf } from "@/features/bookings/server/core";
import { addDays, localDateOf, wallToUtc } from "@/lib/availability/tz";
import { type OverviewBooking, weekWindow } from "../overview";

const DAY = 86_400_000;

export type DashboardData = {
  /** Accepted and pending bookings that haven't ended, starting before the end of tomorrow. */
  upcoming: OverviewBooking[];
  /** Every active booking that starts today, including the ones already over. */
  today: OverviewBooking[];
  week: { count: number; previous: number; byEventType: Record<string, number> };
  pendingCount: number;
  noShows: { count: number; of: number };
};

/** Pending bookings needing the host's decision; cheap enough for the layout's nav badge. */
export async function countPending(db: Database, hostId: string, now: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(booking)
    .where(and(isHostOf(hostId), eq(booking.status, "pending"), gte(booking.endAt, new Date(now))));
  return row?.n ?? 0;
}

async function listWindow(db: Database, hostId: string, from: number, to: number): Promise<OverviewBooking[]> {
  const rows = await db
    .select({ booking, eventTitle: eventType.title, teamName: team.name })
    .from(booking)
    .innerJoin(eventType, eq(eventType.id, booking.eventTypeId))
    .leftJoin(team, eq(team.id, eventType.teamId))
    .where(and(isHostOf(hostId), inArray(booking.status, ["accepted", "pending"]), gte(booking.startAt, new Date(from)), lt(booking.startAt, new Date(to))))
    .orderBy(asc(booking.startAt))
    .limit(100);
  const ids = rows.map((r) => r.booking.id);
  const people = ids.length
    ? await db
        .select({ bookingId: attendee.bookingId, name: attendee.name, isGuest: attendee.isGuest })
        .from(attendee)
        .where(inArray(attendee.bookingId, ids))
        .orderBy(asc(attendee.createdAt))
    : [];
  return rows.map(({ booking: b, eventTitle, teamName }) => {
    const mine = people.filter((p) => p.bookingId === b.id);
    return {
      id: b.id,
      uid: b.uid,
      status: b.status as OverviewBooking["status"],
      startAt: b.startAt.getTime(),
      endAt: b.endAt.getTime(),
      eventTitle,
      teamName,
      attendeeName: (mine.find((p) => !p.isGuest) ?? mine[0])?.name ?? null,
      locationKind: b.locationKind,
      locationValue: b.locationValue,
    };
  });
}

/** Everything the dashboard home shows, for one host, in their time zone. */
export async function loadDashboard(
  db: Database,
  hostId: string,
  options: { now: number; timeZone: string; weekStart: number },
): Promise<DashboardData> {
  const { now, timeZone, weekStart } = options;
  const today = localDateOf(now, timeZone);
  const todayStart = wallToUtc(today, 0, timeZone);
  const window = weekWindow(now, timeZone, weekStart);
  const active = inArray(booking.status, [...ACTIVE]);

  const [twoDays, weekRows, pendingCount, noShowRows] = await Promise.all([
    listWindow(db, hostId, todayStart, wallToUtc(addDays(today, 2), 0, timeZone)),
    db
      .select({ eventTypeId: booking.eventTypeId, current: sql<boolean>`${booking.startAt} >= ${new Date(window.start)}`, n: count() })
      .from(booking)
      .where(and(isHostOf(hostId), active, gte(booking.startAt, new Date(window.previousStart)), lt(booking.startAt, new Date(window.end))))
      .groupBy(booking.eventTypeId, sql`2`),
    countPending(db, hostId, now),
    db
      .select({
        n: count(),
        // Raw SQL with qualified names so the correlated subquery can't bind "id" to the attendee.
        noShows: sql<number>`count(*) FILTER (WHERE "booking"."host_no_show" OR EXISTS (SELECT 1 FROM "attendee" a WHERE a.booking_id = "booking"."id" AND a.no_show))`.mapWith(Number),
      })
      .from(booking)
      .where(and(isHostOf(hostId), eq(booking.status, "accepted"), gte(booking.endAt, new Date(now - 30 * DAY)), lt(booking.endAt, new Date(now)))),
  ]);

  const byEventType: Record<string, number> = {};
  let current = 0;
  let previous = 0;
  for (const row of weekRows) {
    if (row.current) {
      current += row.n;
      byEventType[row.eventTypeId] = (byEventType[row.eventTypeId] ?? 0) + row.n;
    } else previous += row.n;
  }

  const tomorrowStart = wallToUtc(addDays(today, 1), 0, timeZone);
  return {
    upcoming: twoDays.filter((b) => b.endAt >= now),
    today: twoDays.filter((b) => b.startAt < tomorrowStart),
    week: { count: current, previous, byEventType },
    pendingCount,
    noShows: { count: noShowRows[0]?.noShows ?? 0, of: noShowRows[0]?.n ?? 0 },
  };
}
