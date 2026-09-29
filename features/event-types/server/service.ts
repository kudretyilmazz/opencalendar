import { and, asc, eq, gte, inArray, isNull, max, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db/client";
import { booking, eventType, eventTypeDurationOption, eventTypeLocation, eventTypeQuestion, schedule, user } from "@/db/schema";
import type { EventTypeInput } from "@/lib/availability/types";
import { newId } from "@/lib/ids";
import { type EventTypeForm, eventTypeFormSchema, type LocationKind, type Question } from "../schemas";
import { createDefaultReminder } from "@/features/workflows/server/service";
import { applyLocks } from "@/features/teams/managed";

export type EventTypeRow = typeof eventType.$inferSelect;
export type EventTypeLocationView = { kind: LocationKind; value: string | null };
export type EventTypeView = EventTypeRow & { extraDurations: number[]; locations: EventTypeLocationView[]; questions: Question[] };

export class EventTypeError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "SLUG_TAKEN" | "SCHEDULE_NOT_FOUND" | "HAS_UPCOMING_BOOKINGS") {
    super(code);
    this.name = "EventTypeError";
  }
}

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505";

/** All durations a booker can pick, default first (EVT-002). */
export const durationsOf = (et: Pick<EventTypeView, "durationMinutes" | "extraDurations">) => [
  et.durationMinutes,
  ...et.extraDurations.filter((d) => d !== et.durationMinutes),
];

export function toEngineEvent(et: EventTypeRow, durationMin = et.durationMinutes): EventTypeInput {
  const horizon: EventTypeInput["horizon"] =
    et.horizonType === "date_range" && et.rangeStart && et.rangeEnd
      ? { type: "date_range", start: et.rangeStart, end: et.rangeEnd }
      : et.horizonType === "rolling_days" || et.horizonType === "rolling_business_days"
        ? { type: et.horizonType, days: et.horizonDays ?? 60 }
        : { type: "unlimited" };
  return {
    durationMin,
    // Without an explicit interval, starts are spaced by the selected duration (EVT-006).
    slotIntervalMin: et.slotIntervalMinutes ?? undefined,
    bufferBeforeMin: et.bufferBeforeMinutes,
    bufferAfterMin: et.bufferAfterMinutes,
    minNoticeMin: et.minNoticeMinutes,
    horizon,
    limits: { bookings: et.bookingLimits, minutes: et.durationLimits },
    seats: et.seatsPerSlot ?? undefined,
  };
}

async function withDurations(db: DbOrTx, rows: EventTypeRow[]): Promise<EventTypeView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [options, locations, questions] = await Promise.all([
    db.select().from(eventTypeDurationOption).where(inArray(eventTypeDurationOption.eventTypeId, ids)),
    db.select().from(eventTypeLocation).where(inArray(eventTypeLocation.eventTypeId, ids)).orderBy(asc(eventTypeLocation.position)),
    db.select().from(eventTypeQuestion).where(inArray(eventTypeQuestion.eventTypeId, ids)).orderBy(asc(eventTypeQuestion.position)),
  ]);
  return rows.map((r) => ({
    ...r,
    extraDurations: options
      .filter((o) => o.eventTypeId === r.id)
      .map((o) => o.durationMinutes)
      .toSorted((a, b) => a - b),
    // The M1 value "phone" means the invitee calls the host.
    locations: locations
      .filter((l) => l.eventTypeId === r.id)
      .map((l): EventTypeLocationView => ({ kind: l.kind === "phone" ? "phone_host" : l.kind, value: l.value })),
    questions: questions
      .filter((q) => q.eventTypeId === r.id)
      .map((q): Question => ({ key: q.key, type: q.type, label: q.label, placeholder: q.placeholder, required: q.required, hidden: q.hidden, options: q.options })),
  }));
}

/** A user's personal event types (team event types have a `team_id`; their owner is the creator). */
export const personalOf = (userId: string) => and(eq(eventType.ownerUserId, userId), isNull(eventType.teamId));

export const loadEventTypeViews = withDurations;

export async function listEventTypes(db: Database, userId: string): Promise<EventTypeView[]> {
  const rows = await db
    .select()
    .from(eventType)
    .where(personalOf(userId))
    .orderBy(asc(eventType.position), asc(eventType.createdAt));
  return withDurations(db, rows);
}

export async function getEventType(db: Database, userId: string, id: string): Promise<EventTypeView | null> {
  const rows = await db
    .select()
    .from(eventType)
    .where(and(eq(eventType.id, id), personalOf(userId)));
  return (await withDurations(db, rows))[0] ?? null;
}

async function assertScheduleOwned(db: Database, userId: string, scheduleId: string | null): Promise<void> {
  if (!scheduleId) return;
  const [row] = await db.select({ id: schedule.id }).from(schedule).where(and(eq(schedule.id, scheduleId), eq(schedule.userId, userId)));
  if (!row) throw new EventTypeError("SCHEDULE_NOT_FOUND");
}

export const columns = (input: EventTypeForm) => {
  const { extraDurations: _extra, locations: _locations, questions: _questions, ...rest } = input;
  return rest;
};

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Writes the child rows of an event type (durations, locations, questions). */
export async function writeEventTypeDetails(tx: Tx, id: string, input: Pick<EventTypeForm, "extraDurations" | "locations" | "questions">) {
  await saveDurations(tx, id, input.extraDurations);
  await saveLocations(tx, id, input.locations);
  await saveQuestions(tx, id, input.questions);
}

async function saveQuestions(tx: Tx, id: string, questions: EventTypeForm["questions"]) {
  await tx.delete(eventTypeQuestion).where(eq(eventTypeQuestion.eventTypeId, id));
  if (questions.length) {
    await tx.insert(eventTypeQuestion).values(questions.map((q, position) => ({ ...q, id: newId(), eventTypeId: id, position })));
  }
}

async function saveLocations(tx: Tx, id: string, locations: EventTypeForm["locations"]) {
  await tx.delete(eventTypeLocation).where(eq(eventTypeLocation.eventTypeId, id));
  if (locations.length) {
    await tx
      .insert(eventTypeLocation)
      .values(locations.map((l, position) => ({ id: newId(), eventTypeId: id, kind: l.kind, value: l.value, position })));
  }
}

async function saveDurations(tx: Tx, id: string, durations: number[]) {
  await tx.delete(eventTypeDurationOption).where(eq(eventTypeDurationOption.eventTypeId, id));
  if (durations.length) {
    await tx.insert(eventTypeDurationOption).values(durations.map((durationMinutes) => ({ eventTypeId: id, durationMinutes })));
  }
}

/** `defaultReminder`: new event types get the 24-hour reminder workflow (NTF-006). */
export async function createEventType(db: Database, userId: string, input: EventTypeForm, options: { defaultReminder?: boolean } = {}): Promise<string> {
  await assertScheduleOwned(db, userId, input.scheduleId);
  const id = newId();
  try {
    await db.transaction(async (tx) => {
      const [{ value }] = await tx.select({ value: max(eventType.position) }).from(eventType).where(personalOf(userId));
      await tx.insert(eventType).values({ id, ownerUserId: userId, position: (value ?? -1) + 1, ...columns(input) });
      await saveDurations(tx, id, input.extraDurations);
      await saveLocations(tx, id, input.locations);
      await saveQuestions(tx, id, input.questions);
      if (options.defaultReminder) await createDefaultReminder(tx, userId, id);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new EventTypeError("SLUG_TAKEN");
    throw error;
  }
  return id;
}

/**
 * A member's copy of a managed event type (TEAM-008) keeps the template's locked fields whatever
 * the form says: the server enforces locks, the UI only shows them.
 */
async function withLocks(db: Database, userId: string, id: string, input: EventTypeForm): Promise<EventTypeForm> {
  const [row] = await db.select({ parentId: eventType.parentId }).from(eventType).where(and(eq(eventType.id, id), personalOf(userId)));
  if (!row?.parentId) return input;
  const [parent] = await withDurations(db, await db.select().from(eventType).where(eq(eventType.id, row.parentId)));
  return parent ? applyLocks(parent, input) : input;
}

export async function updateEventType(db: Database, userId: string, id: string, raw: EventTypeForm): Promise<void> {
  await assertScheduleOwned(db, userId, raw.scheduleId);
  const input = await withLocks(db, userId, id, raw);
  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(eventType)
        .set(columns(input))
        .where(and(eq(eventType.id, id), personalOf(userId)))
        .returning({ id: eventType.id });
      if (!updated.length) throw new EventTypeError("NOT_FOUND");
      await saveDurations(tx, id, input.extraDurations);
      await saveLocations(tx, id, input.locations);
      await saveQuestions(tx, id, input.questions);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new EventTypeError("SLUG_TAKEN");
    throw error;
  }
}

export async function setEventTypeEnabled(db: Database, userId: string, id: string, enabled: boolean): Promise<void> {
  const updated = await db
    .update(eventType)
    .set({ enabled })
    .where(and(eq(eventType.id, id), personalOf(userId)))
    .returning({ id: eventType.id });
  if (!updated.length) throw new EventTypeError("NOT_FOUND");
}

/**
 * Deleting would cascade to bookings, so an event type with upcoming active bookings can't be
 * deleted (turn it off instead, or cancel those bookings first so invitees are notified).
 */
export async function deleteEventType(db: Database, userId: string, id: string, now = Date.now()): Promise<void> {
  const [upcoming] = await db
    .select({ id: booking.id })
    .from(booking)
    .where(
      and(
        eq(booking.eventTypeId, id),
        inArray(booking.status, ["accepted", "pending", "awaiting_payment"]),
        gte(booking.endAt, new Date(now)),
      ),
    )
    .limit(1);
  if (upcoming) throw new EventTypeError("HAS_UPCOMING_BOOKINGS");
  const deleted = await db
    .delete(eventType)
    .where(and(eq(eventType.id, id), personalOf(userId)))
    .returning({ id: eventType.id });
  if (!deleted.length) throw new EventTypeError("NOT_FOUND");
}

/** Copies an event type with a free "-copy" slug. */
export async function duplicateEventType(db: Database, userId: string, id: string): Promise<string> {
  const source = await getEventType(db, userId, id);
  if (!source) throw new EventTypeError("NOT_FOUND");
  const taken = new Set((await listEventTypes(db, userId)).map((e) => e.slug));
  let slug = `${source.slug}-copy`;
  for (let n = 2; taken.has(slug); n++) slug = `${source.slug}-copy-${n}`;
  const {
    id: _id,
    ownerUserId: _owner,
    position: _pos,
    createdAt: _c,
    updatedAt: _u,
    enabled: _e,
    destinationCalendarId: _d,
    extraDurations,
    locations,
    questions,
    ...rest
  } = source;
  // Parsing keeps only form fields: a copy of a managed copy must not stay linked to the template.
  const input = eventTypeFormSchema.parse({ ...rest, title: `${source.title} (copy)`, slug, extraDurations, locations, questions });
  return createEventType(db, userId, input, { defaultReminder: true });
}

/** Moves an event type one place up or down in the profile order. */
export async function moveEventType(db: Database, userId: string, id: string, direction: "up" | "down"): Promise<void> {
  const list = await listEventTypes(db, userId);
  const index = list.findIndex((e) => e.id === id);
  if (index < 0) throw new EventTypeError("NOT_FOUND");
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= list.length) return;
  const order = list.map((e) => e.id);
  [order[index], order[swapWith]] = [order[swapWith], order[index]];
  await db.transaction(async (tx) => {
    for (const [position, eventTypeId] of order.entries()) {
      await tx.update(eventType).set({ position }).where(and(eq(eventType.id, eventTypeId), personalOf(userId)));
    }
  });
}

// ---------------------------------------------------------------------------- public pages

export type PublicHost = {
  id: string;
  name: string;
  email: string;
  username: string;
  timeZone: string;
  locale: string;
  timeFormat: number;
  image: string | null;
};

/** Hosts can publish only after verifying their email (AUTH-001) and while not disabled. */
export async function findPublicHost(db: Database, username: string): Promise<PublicHost | null> {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      timeZone: user.timeZone,
      locale: user.locale,
      timeFormat: user.timeFormat,
      image: user.image,
    })
    .from(user)
    .where(and(sql`lower(${user.username}) = ${username.toLowerCase()}`, eq(user.emailVerified, true), sql`${user.disabledAt} IS NULL`));
  return row?.username ? { ...row, username: row.username } : null;
}

export async function listPublicEventTypes(db: Database, hostId: string): Promise<EventTypeView[]> {
  const rows = await db
    .select()
    .from(eventType)
    .where(and(personalOf(hostId), eq(eventType.enabled, true), eq(eventType.hidden, false)))
    .orderBy(asc(eventType.position), asc(eventType.createdAt));
  return withDurations(db, rows);
}

/** Enabled event type by slug; hidden ones are still bookable by direct link (EVT-014). */
export async function findPublicEventType(db: Database, hostId: string, slug: string): Promise<EventTypeView | null> {
  const rows = await db
    .select()
    .from(eventType)
    .where(and(personalOf(hostId), eq(eventType.slug, slug.toLowerCase()), eq(eventType.enabled, true)));
  return (await withDurations(db, rows))[0] ?? null;
}
