import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Database, Tx } from "@/db/client";
import { attendee, booking, bookingHost, bookingReference, eventType, eventTypeQuestion, slotReservation, user } from "@/db/schema";
import { computeSlots, computeTeamSlots, isSlotAvailable, type TeamHostInput, type TeamSlot } from "@/lib/availability";
import type { HostInput, Interval, Slot } from "@/lib/availability/types";
import { hashToken, newId, tokenMatches } from "@/lib/ids";
import { durationsOf, type EventTypeView, type PublicHost, toEngineEvent } from "@/features/event-types/server/service";
import { type ScheduleView, scheduleForEventType, toScheduleInput } from "@/features/schedules/server/service";
import { ACTIVE, assertPlausibleStart, BookingFailure, type AttendeeRow, type BookingRow, deactivate, type ExternalBusyFn, HOLD_TTL_MS, isHostOf, MIN, validationWindow, withExternal } from "./core";
import { attendeeMayCancel, findSeat, lockSeries, policyFor } from "./decisions";
import { invalidateHostDisplayCache, loadHostInput, loadHostInputForDisplay, refreshDisplay } from "./host-data";

export {
  ACTIVE,
  type AttendeeRow,
  assertPlausibleStart,
  type BookingError,
  BookingFailure,
  type BookingRow,
  deactivate,
  type ExternalBusyFn,
  HOLD_TTL_MS,
  lockHost,
  MIN,
} from "./core";
export { type BookerInput, type ChosenLocation, type CreateBookingInput, type CreatedBooking, createBooking, type HostPlan } from "./create";
import type { HostPlan } from "./create";

// ---------------------------------------------------------------------------- slots

export type SlotsRequest = {
  host: PublicHost;
  eventType: EventTypeView;
  durationMin: number;
  window: { start: number; end: number };
  now: number;
  rescheduleUid?: string;
  ownHoldToken?: string;
  externalBusy?: ExternalBusyFn;
  /** Pre-loaded schedule (e.g. from a short-lived cache); loaded when omitted. */
  schedule?: ScheduleView | null;
  /** Public slot endpoint only: share host data across requests for a second (NFR-001). */
  displayCache?: boolean;
};

const DAY_MS = 24 * 60 * MIN;
const MAX_FUTURE_MS = 2 * 366 * DAY_MS;

/**
 * Clamps a requested display window to what can ever be bookable (not in the past, not beyond
 * two years) and derives the external-calendar window snapped to whole UTC days, so arbitrary
 * client windows share cache entries instead of each triggering a provider call.
 */
export function slotWindows(window: Interval, now: number): { display: Interval; external: Interval } | null {
  const start = Math.max(window.start, now - DAY_MS);
  const end = Math.min(window.end, now + MAX_FUTURE_MS);
  if (end <= start) return null;
  return { display: { start, end }, external: { start: Math.floor(start / DAY_MS) * DAY_MS, end: Math.ceil(end / DAY_MS) * DAY_MS } };
}

/** What the data loader needs to know about the event type for limits and seats. */
function engineScope(et: EventTypeView) {
  const e = toEngineEvent(et);
  return { id: et.id, limits: e.limits, seats: e.seats };
}

/** Bookable slots for the public booking page (BKG-002). */
export async function getAvailableSlots(db: Database, input: SlotsRequest): Promise<Slot[]> {
  if (!durationsOf(input.eventType).includes(input.durationMin)) throw new BookingFailure("INVALID_DURATION");
  const windows = slotWindows(input.window, input.now);
  if (!windows) return [];
  const req = { ...input, window: windows.display };
  // Independent reads run concurrently: schedule, bookings/holds and external calendars.
  const [sched, loaded, external] = await Promise.all([
    req.schedule !== undefined ? req.schedule : scheduleForEventType(db, req.host.id, req.eventType.scheduleId),
    (req.displayCache ? loadHostInputForDisplay : loadHostInput)(db, {
      hostId: req.host.id,
      schedule: { timeZone: "UTC", rules: [], overrides: [] },
      // Whole days (a superset of the display window), so nearby requests share cache entries.
      window: req.displayCache ? windows.external : req.window,
      now: req.now,
      ownHoldHash: req.ownHoldToken ? hashToken(req.ownHoldToken) : undefined,
      eventType: engineScope(req.eventType),
    }),
    req.externalBusy?.(windows.external),
  ]);
  if (!sched) return [];
  const host: HostInput = { ...loaded, schedule: toScheduleInput(sched), ...(external && { externalBusy: external }) };
  return [...computeSlots(toEngineEvent(req.eventType, req.durationMin), host, { now: req.now, window: req.window, rescheduleUid: req.rescheduleUid }).slots];
}

export type TeamSlotsRequest = Omit<SlotsRequest, "host" | "externalBusy" | "schedule"> & {
  hosts: HostPlan[];
  externalBusyFor?: (hostId: string) => ExternalBusyFn | undefined;
};

/**
 * Slots of a team or dynamic-group target (TEAM-004/005/007, NFR-002): each host's data is loaded
 * in parallel, then the pure engine combines them. Hosts without a schedule offer nothing; a
 * fixed host without one makes the whole target unbookable.
 */
export async function getTeamSlots(db: Database, input: TeamSlotsRequest): Promise<TeamSlot[]> {
  if (!durationsOf(input.eventType).includes(input.durationMin)) throw new BookingFailure("INVALID_DURATION");
  const windows = slotWindows(input.window, input.now);
  if (!windows || !input.hosts.length) return [];
  const scope = engineScope(input.eventType);
  const perHost = await Promise.all(
    input.hosts.map(async (plan) => {
      const [sched, loaded, external] = await Promise.all([
        scheduleForEventType(db, plan.host.id, plan.scheduleId),
        (input.displayCache ? loadHostInputForDisplay : loadHostInput)(db, {
          hostId: plan.host.id,
          schedule: { timeZone: "UTC", rules: [], overrides: [] },
          window: input.displayCache ? windows.external : windows.display,
          now: input.now,
          ownHoldHash: input.ownHoldToken ? hashToken(input.ownHoldToken) : undefined,
          eventType: scope,
        }),
        input.externalBusyFor?.(plan.host.id)?.(windows.external),
      ]);
      return sched ? { host: { ...loaded, schedule: toScheduleInput(sched), ...(external && { externalBusy: external }) }, fixed: plan.fixed } : { missing: plan.fixed };
    }),
  );
  if (perHost.some((h) => "missing" in h && h.missing)) return [];
  const hosts = perHost.flatMap((h) => ("host" in h ? [h as TeamHostInput] : []));
  const result = computeTeamSlots(toEngineEvent(input.eventType, input.durationMin), hosts, { now: input.now, window: windows.display, rescheduleUid: input.rescheduleUid });
  return [...result.slots];
}

export const MAX_ACTIVE_HOLDS_PER_HOST = 25;

/**
 * Holds a slot for this booker session so others can't take it while they type (BKG-006).
 * Only a slot the engine would offer can be held, and a host can't have more than
 * MAX_ACTIVE_HOLDS_PER_HOST live holds, so holds can't be used to block a calendar.
 */
export async function holdSlot(
  db: Database,
  input: {
    host: PublicHost;
    eventType: EventTypeView;
    start: number;
    durationMin: number;
    token: string;
    now: number;
    externalBusy?: ExternalBusyFn;
  },
): Promise<void> {
  if (!durationsOf(input.eventType).includes(input.durationMin)) throw new BookingFailure("INVALID_DURATION");
  assertPlausibleStart(input.start, input.now);
  const sessionTokenHash = hashToken(input.token);
  const slot = { start: input.start, end: input.start + input.durationMin * MIN };
  const sched = await scheduleForEventType(db, input.host.id, input.eventType.scheduleId);
  if (!sched) throw new BookingFailure("NO_SCHEDULE");
  const engineEvent = toEngineEvent(input.eventType, input.durationMin);
  const local = await loadHostInput(db, {
    hostId: input.host.id,
    schedule: toScheduleInput(sched),
    window: slot,
    now: input.now,
    ownHoldHash: sessionTokenHash,
    eventType: engineScope(input.eventType),
  });
  // Cheap check first: only a slot the schedule offers is worth an external calendar read.
  const pre = isSlotAvailable(engineEvent, local, slot, { now: input.now });
  if (!pre.ok) throw new BookingFailure("SLOT_UNAVAILABLE", pre.reason);
  const host = await withExternal(local, input.externalBusy, validationWindow(slot.start));
  const check = isSlotAvailable(engineEvent, host, slot, { now: input.now });
  if (!check.ok) throw new BookingFailure("SLOT_UNAVAILABLE", check.reason);
  if (host.holds.length >= MAX_ACTIVE_HOLDS_PER_HOST) throw new BookingFailure("SLOT_UNAVAILABLE", "hold_limit");
  const values = {
    eventTypeId: input.eventType.id,
    userId: input.host.id,
    startAt: new Date(slot.start),
    endAt: new Date(slot.end),
    expiresAt: new Date(input.now + HOLD_TTL_MS),
  };
  await db
    .insert(slotReservation)
    .values({ id: newId(), sessionTokenHash, ...values })
    .onConflictDoUpdate({ target: slotReservation.sessionTokenHash, set: values });
  invalidateHostDisplayCache();
}

/** Removes holds that have expired (maintenance job). */
export async function pruneExpiredHolds(db: Database, now: number): Promise<void> {
  await db.delete(slotReservation).where(lt(slotReservation.expiresAt, new Date(now)));
}

// ---------------------------------------------------------------------------- read / cancel

export type BookingEventTypeInfo = {
  id: string;
  title: string;
  slug: string;
  seatsPerSlot: number | null;
  seatsShowAttendees: boolean;
  disableCancelling: boolean;
  disableRescheduling: boolean;
  cancelCutoffMinutes: number | null;
  /** Question labels by key, to show answers (EVT-009). */
  questions: { key: string; label: string }[];
};

export type BookingDetails = {
  booking: BookingRow;
  attendees: AttendeeRow[];
  eventType: BookingEventTypeInfo;
  /** The organizer (the round-robin pick, or the first collective host). */
  host: PublicHost;
  /** Every host of the booking, organizer first (collective co-hosts too, TEAM-004). */
  hosts: PublicHost[];
};

const toPublicHost = (row: typeof user.$inferSelect): PublicHost => ({
  id: row.id,
  name: row.name,
  email: row.email,
  username: row.username ?? "",
  timeZone: row.timeZone,
  locale: row.locale,
  timeFormat: row.timeFormat,
  image: row.image,
});

async function details(db: Database, row: BookingRow): Promise<BookingDetails> {
  const [attendees, [et], hostRows, questions] = await Promise.all([
    db.select().from(attendee).where(eq(attendee.bookingId, row.id)).orderBy(asc(attendee.createdAt)),
    db
      .select({
        id: eventType.id,
        title: eventType.title,
        slug: eventType.slug,
        seatsPerSlot: eventType.seatsPerSlot,
        seatsShowAttendees: eventType.seatsShowAttendees,
        disableCancelling: eventType.disableCancelling,
        disableRescheduling: eventType.disableRescheduling,
        cancelCutoffMinutes: eventType.cancelCutoffMinutes,
      })
      .from(eventType)
      .where(eq(eventType.id, row.eventTypeId)),
    db
      .select({ user })
      .from(bookingHost)
      .innerJoin(user, eq(user.id, bookingHost.userId))
      .where(eq(bookingHost.bookingId, row.id)),
    db
      .select({ key: eventTypeQuestion.key, label: eventTypeQuestion.label })
      .from(eventTypeQuestion)
      .where(eq(eventTypeQuestion.eventTypeId, row.eventTypeId))
      .orderBy(asc(eventTypeQuestion.position)),
  ]);
  // The organizer row is loaded separately: a co-host may have left, the organizer always exists.
  const organizer = hostRows.find((h) => h.user.id === row.organizerId)?.user ?? (await db.select().from(user).where(eq(user.id, row.organizerId)))[0];
  const host = toPublicHost(organizer);
  const coHosts = hostRows.filter((h) => h.user.id !== row.organizerId).map((h) => toPublicHost(h.user)).toSorted((a, b) => a.name.localeCompare(b.name));
  return { booking: row, attendees, eventType: { ...et, questions }, host, hosts: [host, ...coHosts] };
}

export async function findBookingById(db: Database, id: string): Promise<BookingDetails | null> {
  const [row] = await db.select().from(booking).where(eq(booking.id, id));
  return row ? details(db, row) : null;
}

export async function findBookingByUid(db: Database, uid: string): Promise<BookingDetails | null> {
  const [row] = await db.select().from(booking).where(eq(booking.uid, uid));
  return row ? details(db, row) : null;
}

/**
 * Details plus what the presented token allows (BKG-011): the booking's manage token manages
 * the booking (and its series); a seat token manages only that seat (EVT-012).
 */
export async function findBookingForManage(db: Database, uid: string, token: string | null | undefined) {
  const found = await findBookingByUid(db, uid);
  if (!found) return null;
  const canManage = tokenMatches(token, found.booking.manageTokenHash);
  const seat = canManage ? null : await findSeat(db, found.booking.id, token);
  return { ...found, canManage, seat };
}

async function cancel(
  db: Database,
  where: ReturnType<typeof and>,
  input: { by: "attendee" | "host" | "system"; reason?: string; now: number; allowPast?: boolean; onCommit?: CancelHook },
): Promise<BookingDetails> {
  const updated = await refreshDisplay(db.transaction(async (tx) => {
    const [row] = await tx.select().from(booking).where(where).for("update");
    if (!row) throw new BookingFailure("NOT_FOUND");
    if (!(ACTIVE as readonly string[]).includes(row.status)) throw new BookingFailure("ALREADY_CANCELLED");
    if (!input.allowPast && row.endAt.getTime() <= input.now) throw new BookingFailure("IN_PAST");
    if (input.by === "attendee") {
      const policy = await policyFor(tx, row.eventTypeId);
      if (policy && !attendeeMayCancel(policy, row.startAt.getTime(), input.now)) throw new BookingFailure("NOT_ALLOWED");
    }
    await deactivate(tx, row.id);
    const [next] = await tx
      .update(booking)
      .set({
        status: "cancelled",
        // A dead booking keeps no decryptable manage token (NTF-005 sealed copy).
        manageTokenSealed: null,
        cancelledBy: input.by,
        cancellationReason: input.reason || null,
        cancelledAt: new Date(input.now),
        sequence: row.sequence + 1,
      })
      .where(eq(booking.id, row.id))
      .returning();
    await input.onCommit?.(tx, next);
    return next;
  }));
  return details(db, updated);
}

/** Runs inside the cancelling transaction, e.g. to enqueue the follow-up job atomically. */
export type CancelHook = (tx: Tx, cancelled: typeof booking.$inferSelect) => Promise<void>;

/** Cancel through the emailed link (BKG-008). The token is checked before anything else. */
export async function cancelByAttendee(db: Database, input: { uid: string; token: string; reason?: string; now: number; onCommit?: CancelHook }) {
  const [row] = await db.select({ id: booking.id, hash: booking.manageTokenHash }).from(booking).where(eq(booking.uid, input.uid));
  if (!row || !tokenMatches(input.token, row.hash)) throw new BookingFailure("NOT_FOUND");
  return cancel(db, and(eq(booking.id, row.id)), { by: "attendee", reason: input.reason, now: input.now, onCommit: input.onCommit });
}

/**
 * EVT-013: cancels every remaining occurrence of the attendee's series in one transaction. The
 * hook runs once per cancelled occurrence (each gets its own emails and calendar cleanup).
 */
export async function cancelSeriesByAttendee(
  db: Database,
  input: { uid: string; token: string; reason?: string; now: number; onCommit?: CancelHook },
): Promise<BookingRow[]> {
  const [row] = await db.select().from(booking).where(eq(booking.uid, input.uid));
  if (!row || !row.recurringSeriesId || !tokenMatches(input.token, row.manageTokenHash)) throw new BookingFailure("NOT_FOUND");
  const seriesId = row.recurringSeriesId;
  return refreshDisplay(db.transaction(async (tx) => {
    const rows = (await lockSeries(tx, seriesId)).filter(
      (r) => (ACTIVE as readonly string[]).includes(r.status) && r.startAt.getTime() > input.now,
    );
    if (!rows.length) throw new BookingFailure("ALREADY_CANCELLED");
    const policy = await policyFor(tx, row.eventTypeId);
    if (policy && !attendeeMayCancel(policy, rows[0].startAt.getTime(), input.now)) throw new BookingFailure("NOT_ALLOWED");
    const cancelled: BookingRow[] = [];
    for (const occurrence of rows) {
      await deactivate(tx, occurrence.id);
      const [next] = await tx
        .update(booking)
        .set({ status: "cancelled", manageTokenSealed: null, cancelledBy: "attendee", cancellationReason: input.reason || null, cancelledAt: new Date(input.now), sequence: occurrence.sequence + 1 })
        .where(eq(booking.id, occurrence.id))
        .returning();
      await input.onCommit?.(tx, next);
      cancelled.push(next);
    }
    return cancelled;
  }));
}

/** Host cancel from the dashboard (BKG-010); any host of the booking can cancel. */
export async function cancelByHost(db: Database, input: { hostId: string; bookingId: string; reason?: string; now: number; onCommit?: CancelHook }) {
  return cancel(db, and(eq(booking.id, input.bookingId), isHostOf(input.hostId)), {
    by: "host",
    reason: input.reason,
    now: input.now,
    onCommit: input.onCommit,
  });
}

/** System cancellation, e.g. when the host deletes their account (ADM-006). */
export async function cancelBySystem(db: Database, input: { bookingId: string; reason: string; now: number; onCommit?: CancelHook }) {
  return cancel(db, and(eq(booking.id, input.bookingId)), { by: "system", reason: input.reason, now: input.now, onCommit: input.onCommit });
}

/** Future bookings the host organizes that are still active. */
export async function listFutureActiveBookingIds(db: Database, hostId: string, now: number): Promise<string[]> {
  const rows = await db
    .select({ id: booking.id })
    .from(booking)
    .where(and(eq(booking.organizerId, hostId), inArray(booking.status, [...ACTIVE]), gte(booking.endAt, new Date(now))));
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------- host dashboard

export const BOOKING_TABS = ["upcoming", "unconfirmed", "past", "cancelled"] as const;
export type BookingTab = (typeof BOOKING_TABS)[number];

export type HostBookingFilter = { tab: BookingTab; eventTypeId?: string; from?: number; to?: number; now: number };

/**
 * Which bookings a tab shows. Upcoming includes requests still waiting for the host's decision
 * (they hold the time too); Unconfirmed shows only those.
 */
function tabWhere(tab: BookingTab, now: Date) {
  return {
    upcoming: and(inArray(booking.status, ["accepted", "pending"]), gte(booking.endAt, now)),
    unconfirmed: and(inArray(booking.status, ["pending"]), gte(booking.endAt, now)),
    past: and(inArray(booking.status, [...ACTIVE]), lt(booking.endAt, now)),
    cancelled: inArray(booking.status, ["cancelled", "rejected"]),
  }[tab];
}

/** The host's bookings (any role on the booking) narrowed by the dashboard's filters. */
function filterWhere(hostId: string, filter: Omit<HostBookingFilter, "tab">) {
  return and(
    isHostOf(hostId),
    filter.eventTypeId ? eq(booking.eventTypeId, filter.eventTypeId) : undefined,
    filter.from !== undefined ? gte(booking.startAt, new Date(filter.from)) : undefined,
    filter.to !== undefined ? lt(booking.startAt, new Date(filter.to)) : undefined,
  );
}

export async function listHostBookings(db: Database, hostId: string, filter: HostBookingFilter) {
  const rows = await db
    .select({ booking, eventTitle: eventType.title })
    .from(booking)
    .innerJoin(eventType, eq(eventType.id, booking.eventTypeId))
    .where(and(filterWhere(hostId, filter), tabWhere(filter.tab, new Date(filter.now))))
    .orderBy(filter.tab === "upcoming" || filter.tab === "unconfirmed" ? asc(booking.startAt) : desc(booking.startAt))
    .limit(200);
  const ids = rows.map((r) => r.booking.id);
  const typeIds = [...new Set(rows.map((r) => r.booking.eventTypeId))];
  const [attendees, failed, questions] = ids.length
    ? await Promise.all([
        db.select().from(attendee).where(inArray(attendee.bookingId, ids)).orderBy(asc(attendee.createdAt)),
        db
          .select({ bookingId: bookingReference.bookingId })
          .from(bookingReference)
          .where(and(inArray(bookingReference.bookingId, ids), eq(bookingReference.status, "failed"))),
        db.select({ eventTypeId: eventTypeQuestion.eventTypeId, key: eventTypeQuestion.key, label: eventTypeQuestion.label }).from(eventTypeQuestion).where(inArray(eventTypeQuestion.eventTypeId, typeIds)),
      ])
    : [[], [], []];
  const failedIds = new Set(failed.map((f) => f.bookingId));
  return rows.map((r) => ({
    ...r.booking,
    eventTitle: r.eventTitle,
    attendees: attendees.filter((a) => a.bookingId === r.booking.id),
    /** An external calendar/meeting couldn't be updated for this booking (INT-012). */
    syncFailed: failedIds.has(r.booking.id),
    questionLabels: Object.fromEntries(questions.filter((q) => q.eventTypeId === r.booking.eventTypeId).map((q) => [q.key, q.label])) as Record<string, string>,
  }));
}

export type HostBooking = Awaited<ReturnType<typeof listHostBookings>>[number];

/** Tab counts for the bookings page, with the list's filters: upcoming, and those awaiting a decision. */
export async function countHostBookings(
  db: Database,
  hostId: string,
  filter: Omit<HostBookingFilter, "tab">,
): Promise<{ upcoming: number; unconfirmed: number }> {
  const now = new Date(filter.now);
  const [row] = await db
    .select({
      upcoming: sql<number>`count(*) FILTER (WHERE ${tabWhere("upcoming", now)})`.mapWith(Number),
      unconfirmed: sql<number>`count(*) FILTER (WHERE ${tabWhere("unconfirmed", now)})`.mapWith(Number),
    })
    .from(booking)
    .where(and(filterWhere(hostId, filter), gte(booking.endAt, now)));
  return { upcoming: row?.upcoming ?? 0, unconfirmed: row?.unconfirmed ?? 0 };
}
