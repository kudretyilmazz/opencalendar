import { and, count, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { eventType } from "@/db/schema";
import { scheduleLine } from "../week";
import { getSchedule, listSchedules, type ScheduleSummary, type ScheduleView } from "./service";

/**
 * How many of the user's own event types book against each of their schedules. An event type
 * without a schedule (or with one that isn't theirs) uses the default, as `scheduleForEventType` does.
 */
export async function eventTypeCountsBySchedule(
  db: Database,
  userId: string,
  schedules: readonly Pick<ScheduleSummary, "id" | "isDefault">[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(schedules.map((s) => [s.id, 0]));
  const defaultId = schedules.find((s) => s.isDefault)?.id;
  const rows = await db
    .select({ scheduleId: eventType.scheduleId, n: count() })
    .from(eventType)
    .where(and(eq(eventType.ownerUserId, userId), isNull(eventType.teamId)))
    .groupBy(eventType.scheduleId);
  for (const { scheduleId, n } of rows) {
    const id = scheduleId && scheduleId in counts ? scheduleId : defaultId;
    if (id) counts[id] += n;
  }
  return counts;
}

export type ScheduleCard = ScheduleView & { eventTypeCount: number; line: string };

/** Every schedule of the user with its rules, usage and summary line, default first. */
export async function loadScheduleCards(db: Database, userId: string, weekStart: number): Promise<ScheduleCard[]> {
  const summaries = await listSchedules(db, userId);
  const [views, counts] = await Promise.all([
    Promise.all(summaries.map((s) => getSchedule(db, userId, s.id))),
    eventTypeCountsBySchedule(db, userId, summaries),
  ]);
  return views
    .filter((v): v is ScheduleView => v !== null)
    .map((v) => ({
      ...v,
      eventTypeCount: counts[v.id] ?? 0,
      line: scheduleLine(v.rules, weekStart, counts[v.id] ?? 0),
    }))
    .toSorted((a, b) => Number(b.isDefault) - Number(a.isDefault));
}
