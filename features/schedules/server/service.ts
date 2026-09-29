import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db/client";
import { dateOverride, eventType, schedule, scheduleRule } from "@/db/schema";
import type { ScheduleInput, Weekday } from "@/lib/availability/types";
import { newId } from "@/lib/ids";
import { DEFAULT_RULES, type ScheduleForm } from "../schemas";

export type ScheduleSummary = { id: string; name: string; timeZone: string; isDefault: boolean };
export type ScheduleView = ScheduleSummary & ScheduleForm;

export class ScheduleError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "IS_DEFAULT") {
    super(code);
    this.name = "ScheduleError";
  }
}

const hhmm = (t: string) => t.slice(0, 5); // Postgres returns HH:mm:ss

export async function listSchedules(db: Database, userId: string): Promise<ScheduleSummary[]> {
  return db
    .select({ id: schedule.id, name: schedule.name, timeZone: schedule.timeZone, isDefault: schedule.isDefault })
    .from(schedule)
    .where(eq(schedule.userId, userId))
    .orderBy(asc(schedule.createdAt));
}

/** Loads a schedule only if it belongs to `userId` (ownership check). */
export async function getSchedule(db: DbOrTx, userId: string, id: string): Promise<ScheduleView | null> {
  const [row] = await db
    .select()
    .from(schedule)
    .where(and(eq(schedule.id, id), eq(schedule.userId, userId)));
  if (!row) return null;
  const [rules, overrides] = await Promise.all([
    db.select().from(scheduleRule).where(eq(scheduleRule.scheduleId, id)).orderBy(asc(scheduleRule.weekday), asc(scheduleRule.startTime)),
    db.select().from(dateOverride).where(eq(dateOverride.scheduleId, id)).orderBy(asc(dateOverride.date), asc(dateOverride.startTime)),
  ]);
  const byDate = new Map<string, { start: string; end: string }[]>();
  for (const o of overrides) {
    const ranges = byDate.get(o.date) ?? [];
    byDate.set(o.date, o.startTime && o.endTime ? [...ranges, { start: hhmm(o.startTime), end: hhmm(o.endTime) }] : ranges);
  }
  return {
    id: row.id,
    name: row.name,
    timeZone: row.timeZone,
    isDefault: row.isDefault,
    rules: rules.map((r) => ({ weekday: r.weekday, start: hhmm(r.startTime), end: hhmm(r.endTime) })),
    overrides: [...byDate].map(([date, ranges]) => ({ date, ranges })),
  };
}

export function toScheduleInput(view: Pick<ScheduleView, "timeZone" | "rules" | "overrides">): ScheduleInput {
  return {
    timeZone: view.timeZone,
    rules: view.rules.map((r) => ({ weekday: r.weekday as Weekday, start: r.start, end: r.end })),
    overrides: view.overrides,
  };
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function writeRules(tx: Tx, scheduleId: string, input: ScheduleForm): Promise<void> {
  await tx.delete(scheduleRule).where(eq(scheduleRule.scheduleId, scheduleId));
  await tx.delete(dateOverride).where(eq(dateOverride.scheduleId, scheduleId));
  if (input.rules.length) {
    await tx
      .insert(scheduleRule)
      .values(input.rules.map((r) => ({ id: newId(), scheduleId, weekday: r.weekday, startTime: r.start, endTime: r.end })));
  }
  type OverrideRow = typeof dateOverride.$inferInsert;
  const overrideRows = input.overrides.flatMap((o): OverrideRow[] =>
    o.ranges.length
      ? o.ranges.map((r) => ({ id: newId(), scheduleId, date: o.date, startTime: r.start, endTime: r.end }))
      : [{ id: newId(), scheduleId, date: o.date, startTime: null, endTime: null }],
  );
  if (overrideRows.length) await tx.insert(dateOverride).values(overrideRows);
}

export async function createSchedule(db: Database, userId: string, input: ScheduleForm): Promise<string> {
  const id = newId();
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: schedule.id }).from(schedule).where(eq(schedule.userId, userId)).limit(1);
    await tx.insert(schedule).values({ id, userId, name: input.name, timeZone: input.timeZone, isDefault: existing.length === 0 });
    await writeRules(tx, id, input);
  });
  return id;
}

export async function updateSchedule(db: Database, userId: string, id: string, input: ScheduleForm): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(schedule)
      .set({ name: input.name, timeZone: input.timeZone })
      .where(and(eq(schedule.id, id), eq(schedule.userId, userId)))
      .returning({ id: schedule.id });
    if (!updated.length) throw new ScheduleError("NOT_FOUND");
    await writeRules(tx, id, input);
  });
}

export async function setDefaultSchedule(db: Database, userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: schedule.id }).from(schedule).where(and(eq(schedule.id, id), eq(schedule.userId, userId)));
    if (!target) throw new ScheduleError("NOT_FOUND");
    await tx.update(schedule).set({ isDefault: false }).where(eq(schedule.userId, userId));
    await tx.update(schedule).set({ isDefault: true }).where(eq(schedule.id, id));
  });
}

/** Deletes a non-default schedule; event types using it fall back to the default. */
export async function deleteSchedule(db: Database, userId: string, id: string): Promise<void> {
  const [row] = await db.select().from(schedule).where(and(eq(schedule.id, id), eq(schedule.userId, userId)));
  if (!row) throw new ScheduleError("NOT_FOUND");
  if (row.isDefault) throw new ScheduleError("IS_DEFAULT");
  await db.delete(schedule).where(eq(schedule.id, id));
}

/** Creates "Working hours" (Mon–Fri 09:00–17:00) for users without any schedule. */
export async function ensureDefaultSchedule(db: Database, userId: string, timeZone: string): Promise<string> {
  const [existing] = await db
    .select({ id: schedule.id })
    .from(schedule)
    .where(and(eq(schedule.userId, userId), eq(schedule.isDefault, true)));
  if (existing) return existing.id;
  return createSchedule(db, userId, { name: "Working hours", timeZone, rules: DEFAULT_RULES, overrides: [] });
}

/** The schedule an event type uses: its own, else the owner's default. */
export async function scheduleForEventType(
  db: DbOrTx,
  ownerUserId: string,
  scheduleId: string | null,
): Promise<ScheduleView | null> {
  if (scheduleId) {
    const own = await getSchedule(db, ownerUserId, scheduleId);
    if (own) return own;
  }
  const [def] = await db
    .select({ id: schedule.id })
    .from(schedule)
    .where(and(eq(schedule.userId, ownerUserId), eq(schedule.isDefault, true)));
  return def ? getSchedule(db, ownerUserId, def.id) : null;
}

export async function schedulesInUse(db: Database, userId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ scheduleId: eventType.scheduleId })
    .from(eventType)
    .where(and(eq(eventType.ownerUserId, userId), inArray(eventType.scheduleId, ids)));
  return new Set(rows.map((r) => r.scheduleId).filter((x): x is string => x !== null));
}
