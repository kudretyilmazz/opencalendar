import { and, count, eq, gt, gte, inArray, isNull, or } from "drizzle-orm";
import type { Database, Tx } from "@/db/client";
import { attendee, booking, bookingHost, eventTypeHost, membership, privateLink, slotReservation, user } from "@/db/schema";
import { isSlotAvailable, selectRoundRobinHost } from "@/lib/availability";
import type { HostInput, SameTypeBooking } from "@/lib/availability/types";
import { hashToken, newId, randomToken, tokenMatches } from "@/lib/ids";
import { durationsOf, type EventTypeView, type PublicHost, toEngineEvent } from "@/features/event-types/server/service";
import { type ScheduleView, scheduleForEventType, toScheduleInput } from "@/features/schedules/server/service";
import { bookingTitle } from "../event-name";
import { occurrenceStarts } from "../recurrence";
import {
  ACTIVE,
  type AttendeeRow,
  assertPlausibleStart,
  BookingFailure,
  type BookingRow,
  deactivate,
  type ExternalBusyFn,
  lockHosts,
  MIN,
  needsConfirmation,
  pgCode,
  validationWindow,
} from "./core";
import { loadHostInput, refreshDisplay } from "./host-data";

export type BookerInput = { name: string; email: string; timeZone: string; locale: string; phone?: string };

/** The location the booker chose, already resolved (e.g. a generated Jitsi room). */
export type ChosenLocation = { kind: NonNullable<BookingRow["locationKind"]>; value: string | null };

export type Responses = BookingRow["responses"];

/**
 * A host of a team booking (TEAM-004…007). Fixed hosts always attend; among the others (the
 * round-robin pool) one free host is picked.
 */
export type HostPlan = { host: PublicHost; fixed: boolean; weight: number; priority: number; scheduleId: string | null };

export type CreateBookingInput = {
  /** Personal event types: the host. Team targets: the first host (see `hosts`). */
  host: PublicHost;
  /** Team and dynamic-group targets; personal event types leave it out. */
  hosts?: HostPlan[];
  /** Replaces `{host}` in collective titles, e.g. the team's name. */
  hostsLabel?: string;
  /** External busy times per host for team targets (`externalBusy` is the single-host form). */
  externalBusyFor?: (hostId: string) => ExternalBusyFn | undefined;
  /** RTE-004 */
  routingFormResponseId?: string | null;
  eventType: EventTypeView;
  start: number;
  durationMin: number;
  booker: BookerInput;
  guests: string[];
  notes?: string;
  idempotencyKey?: string;
  holdToken?: string;
  reschedule?: { uid: string; token: string };
  location?: ChosenLocation | null;
  now: number;
  externalBusy?: ExternalBusyFn;
  /** Answers to the event type's questions, already validated (EVT-009). */
  responses?: Responses;
  /** utm_* parameters of the booking page (BKG-014). */
  utm?: Record<string, string> | null;
  source?: "web" | "embed";
  /** Single-use link token (EVT-015). */
  privateLinkToken?: string;
  /** Recurring event types: how many occurrences to book (EVT-013). */
  recurringCount?: number;
  /** Runs inside the booking transaction, e.g. to enqueue side effects atomically. */
  onCommit?: (tx: Tx, created: CreatedBooking) => Promise<void>;
};

export type CreatedBooking = {
  booking: BookingRow;
  attendees: AttendeeRow[];
  token: string;
  previous?: BookingRow;
  /** Seated events: the seat that was added… */
  seat?: AttendeeRow;
  /** …to a booking that already existed (true) or that this seat created. */
  joined?: boolean;
  /** Recurring bookings: every occurrence, first one = `booking`. */
  series?: BookingRow[];
};

/** Reschedule is allowed with the booking's manage token, before the start and the cutoff (EVT-017). */
async function loadReschedulable(tx: Tx, input: CreateBookingInput): Promise<BookingRow> {
  const et = input.eventType;
  const [old] = await tx.select().from(booking).where(eq(booking.uid, input.reschedule!.uid)).for("update");
  const allowed =
    old &&
    tokenMatches(input.reschedule!.token, old.manageTokenHash) &&
    old.eventTypeId === et.id &&
    !old.recurringSeriesId &&
    (ACTIVE as readonly string[]).includes(old.status) &&
    old.startAt.getTime() > input.now;
  if (!allowed) throw new BookingFailure("RESCHEDULE_NOT_ALLOWED");
  const cutoff = et.cancelCutoffMinutes !== null && old.startAt.getTime() - input.now < et.cancelCutoffMinutes * MIN;
  if (et.disableRescheduling || cutoff) throw new BookingFailure("NOT_ALLOWED");
  return old;
}

/** Marks a single-use link as used (EVT-015); the row lock makes concurrent use impossible. */
async function consumeLink(tx: Tx, input: CreateBookingInput): Promise<string | null> {
  if (!input.privateLinkToken) {
    if (input.eventType.linkOnly && !input.reschedule) throw new BookingFailure("LINK_INVALID");
    return null;
  }
  const [link] = await tx
    .select({ id: privateLink.id })
    .from(privateLink)
    .where(
      and(
        eq(privateLink.tokenHash, hashToken(input.privateLinkToken)),
        eq(privateLink.eventTypeId, input.eventType.id),
        isNull(privateLink.usedAt),
        or(isNull(privateLink.expiresAt), gt(privateLink.expiresAt, new Date(input.now))),
      ),
    )
    .for("update");
  if (!link) throw new BookingFailure("LINK_INVALID");
  return link.id;
}

type Occurrence = { start: number; end: number };

function planOccurrences(input: CreateBookingInput, timeZone: string): Occurrence[] {
  const et = input.eventType;
  const duration = input.durationMin * MIN;
  const count = input.recurringCount ?? 1;
  if (count === 1) return [{ start: input.start, end: input.start + duration }];
  if (!et.recurringFrequency || !et.recurringMaxCount || count < 2 || count > et.recurringMaxCount || input.reschedule || input.hosts) {
    throw new BookingFailure("INVALID_RECURRENCE");
  }
  return occurrenceStarts(input.start, count, et.recurringFrequency, timeZone).map((start) => ({ start, end: start + duration }));
}

/** Seated events (EVT-012): join the open booking at this exact slot, if there is one. */
async function joinSeat(tx: Tx, input: CreateBookingInput, slot: Occurrence, token: string): Promise<CreatedBooking | null> {
  const et = input.eventType;
  const [open] = await tx
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.eventTypeId, et.id),
        eq(booking.startAt, new Date(slot.start)),
        eq(booking.endAt, new Date(slot.end)),
        inArray(booking.status, [...ACTIVE]),
      ),
    )
    .for("update");
  if (!open) return null;
  const seats = await tx.select({ email: attendee.email }).from(attendee).where(and(eq(attendee.bookingId, open.id), eq(attendee.isGuest, false)));
  if (seats.length >= (et.seatsPerSlot ?? 0)) throw new BookingFailure("SLOT_UNAVAILABLE", "seats_full");
  if (seats.some((s) => s.email === input.booker.email.toLowerCase())) throw new BookingFailure("DUPLICATE", open.uid);
  const [seat] = await tx
    .insert(attendee)
    .values({
      id: newId(),
      bookingId: open.id,
      ...input.booker,
      email: input.booker.email.toLowerCase(),
      phone: input.booker.phone ?? null,
      isGuest: false,
      seatTokenHash: hashToken(token),
      responses: input.responses ?? {},
      notes: input.notes || null,
    })
    .returning();
  return { booking: open, attendees: [seat], token, seat, joined: true };
}

/**
 * Checks every occurrence for one host; later ones also see the earlier ones (limits, overlaps).
 * Returns the failure detail, or null when the host can take them all.
 */
function checkOccurrences(
  input: CreateBookingInput,
  base: HostInput,
  occurrences: Occurrence[],
  rescheduleUid: string | undefined,
  external: HostInput["externalBusy"][],
): string | null {
  const engineEvent = toEngineEvent(input.eventType, input.durationMin);
  let host = base;
  for (const [i, o] of occurrences.entries()) {
    const check = isSlotAvailable(engineEvent, { ...host, externalBusy: external[i] ?? host.externalBusy }, o, { now: input.now, rescheduleUid });
    if (!check.ok) return occurrences.length > 1 ? `${check.reason}:${i + 1}` : check.reason;
    const planned: SameTypeBooking = { uid: `planned-${i}`, start: o.start, end: o.end, seatsTaken: 1 };
    const b = input.eventType;
    host = {
      ...host,
      bookings: [...host.bookings, { uid: planned.uid, start: o.start, end: o.end, bufferBeforeMin: b.bufferBeforeMinutes, bufferAfterMin: b.bufferAfterMinutes }],
      sameTypeBookings: [...(host.sameTypeBookings ?? []), planned],
    };
  }
  return null;
}

/** The organizer, every host who blocks the time, and why (round robin). */
type Assignment = { organizer: PublicHost; hostIds: string[]; reason: string | null };

type LoadedHost = { plan: HostPlan; schedule: ScheduleView; external: HostInput["externalBusy"][] };

/** Schedules and external calendars per host, read before taking any lock (no I/O under it). */
async function loadPlans(db: Database, input: CreateBookingInput, plans: HostPlan[], occurrences: (tz: string) => Occurrence[]) {
  const schedules = await Promise.all(plans.map((p) => scheduleForEventType(db, p.host.id, p.scheduleId)));
  if (plans.some((p, i) => p.fixed && !schedules[i])) throw new BookingFailure("NO_SCHEDULE");
  const usable = plans.flatMap((plan, i) => (schedules[i] ? [{ plan, schedule: schedules[i] }] : []));
  if (!usable.length) throw new BookingFailure("NO_SCHEDULE");
  const planned = occurrences(usable[0].schedule.timeZone);
  const loaded: LoadedHost[] = await Promise.all(
    usable.map(async (u) => {
      const fn = input.hosts ? input.externalBusyFor?.(u.plan.host.id) : input.externalBusy;
      return { ...u, external: fn ? await Promise.all(planned.map((o) => fn(validationWindow(o.start)))) : [] };
    }),
  );
  return { loaded, occurrences: planned };
}

/**
 * Re-validates every host under the locks and assigns the booking (TEAM-004…007): every fixed
 * host must be free; with a pool, the round-robin selector picks one free pool host.
 */
async function assign(tx: Tx, input: CreateBookingInput, hosts: LoadedHost[], occurrences: Occurrence[], rescheduleUid: string | undefined): Promise<Assignment> {
  const et = input.eventType;
  const engineEvent = toEngineEvent(et, input.durationMin);
  const span = { start: occurrences[0].start, end: occurrences.at(-1)!.end };
  const users = await tx.select({ id: user.id, disabledAt: user.disabledAt }).from(user).where(inArray(user.id, hosts.map((h) => h.plan.host.id)));
  const current = et.teamId ? await currentTeamHosts(tx, et.id, et.teamId) : null;
  // Re-checked under the locks: a host removed from the team (or the event type) meanwhile is out.
  const active = new Set(users.filter((u) => !u.disabledAt && (!current || current.has(u.id))).map((u) => u.id));
  const free = new Set<string>();
  let failure: string | null = null;
  for (const h of hosts) {
    if (!active.has(h.plan.host.id)) {
      // The account was disabled (deletion in progress) while we waited for the lock.
      if (h.plan.fixed) throw new BookingFailure("NOT_FOUND");
      continue;
    }
    const loaded = await loadHostInput(tx, {
      hostId: h.plan.host.id,
      schedule: toScheduleInput(h.schedule),
      window: span,
      now: input.now,
      ownHoldHash: input.holdToken ? hashToken(input.holdToken) : undefined,
      eventType: { id: et.id, limits: engineEvent.limits, seats: engineEvent.seats },
    });
    const why = checkOccurrences(input, loaded, occurrences, rescheduleUid, h.external);
    if (why === null) free.add(h.plan.host.id);
    else failure ??= why;
  }
  const fixed = hosts.filter((h) => h.plan.fixed);
  const pool = hosts.filter((h) => !h.plan.fixed);
  const blocked = fixed.find((h) => !free.has(h.plan.host.id));
  if (blocked || (pool.length && !pool.some((h) => free.has(h.plan.host.id)))) throw new BookingFailure("SLOT_UNAVAILABLE", failure ?? "booking_conflict");
  const fixedIds = fixed.map((h) => h.plan.host.id);
  const candidates = pool.filter((h) => free.has(h.plan.host.id));
  if (!candidates.length) return { organizer: fixed[0].plan.host, hostIds: fixedIds, reason: null };
  const counts = await recentCounts(tx, et.id, candidates.map((c) => c.plan.host.id), input.now - et.roundRobinWindowDays * 24 * 60 * MIN);
  const choice = selectRoundRobinHost(
    candidates.map((c) => ({ userId: c.plan.host.id, name: c.plan.host.name, weight: c.plan.weight, priority: c.plan.priority, recentBookings: counts.get(c.plan.host.id) ?? 0 })),
    et.roundRobinWindowDays,
  )!;
  const organizer = candidates.find((c) => c.plan.host.id === choice.userId)!.plan.host;
  return { organizer, hostIds: [organizer.id, ...fixedIds], reason: choice.reason };
}

/** Hosts of a team event type who are still members of the team. */
async function currentTeamHosts(tx: Tx, eventTypeId: string, teamId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ userId: eventTypeHost.userId })
    .from(eventTypeHost)
    .innerJoin(membership, and(eq(membership.userId, eventTypeHost.userId), eq(membership.teamId, teamId)))
    .where(eq(eventTypeHost.eventTypeId, eventTypeId));
  return new Set(rows.map((r) => r.userId));
}

/** Active bookings of this event type each candidate organizes, starting within the window (TEAM-005). */
async function recentCounts(tx: Tx, eventTypeId: string, hostIds: string[], since: number): Promise<Map<string, number>> {
  const rows = await tx
    .select({ organizerId: booking.organizerId, n: count() })
    .from(booking)
    .where(and(eq(booking.eventTypeId, eventTypeId), inArray(booking.organizerId, hostIds), inArray(booking.status, [...ACTIVE]), gte(booking.startAt, new Date(since))))
    .groupBy(booking.organizerId);
  return new Map(rows.map((r) => [r.organizerId, r.n]));
}

/**
 * Creates (or reschedules into) a booking with three layers of double-booking protection
 * (docs/03-architecture/data-model.md): per-host advisory locks, re-validation with the pure
 * engine inside the transaction, and the booking_host exclusion constraint. Also handles the M3
 * variants (seats, recurring series, pending confirmation, single-use links) and team hosts (M4).
 */
export async function createBooking(db: Database, input: CreateBookingInput): Promise<CreatedBooking> {
  const { eventType: et } = input;
  if (!durationsOf(et).includes(input.durationMin)) throw new BookingFailure("INVALID_DURATION");
  const guestsAllowed = et.seatsPerSlot ? 0 : et.maxGuests; // seats: one person per seat
  if (input.guests.length > guestsAllowed) throw new BookingFailure("TOO_MANY_GUESTS");
  if (input.idempotencyKey) {
    const [dup] = await db
      .select({ uid: booking.uid })
      .from(booking)
      .where(and(eq(booking.eventTypeId, et.id), eq(booking.idempotencyKey, input.idempotencyKey)));
    if (dup) throw new BookingFailure("DUPLICATE", dup.uid);
  }
  assertPlausibleStart(input.start, input.now);
  const plans = input.hosts ?? [{ host: input.host, fixed: true, weight: 100, priority: 2, scheduleId: et.scheduleId }];
  const { loaded, occurrences } = await loadPlans(db, input, plans, (tz) => planOccurrences(input, tz));
  const token = randomToken();

  try {
    return await refreshDisplay(db.transaction(async (tx) => {
      await lockHosts(tx, loaded.map((h) => h.plan.host.id));
      const linkId = await consumeLink(tx, input);
      const previous = input.reschedule ? await loadReschedulable(tx, input) : undefined;
      const assignment = await assign(tx, input, loaded, occurrences, previous?.uid);

      if (et.seatsPerSlot && !previous && !input.hosts) {
        const joined = await joinSeat(tx, input, occurrences[0], token);
        if (joined) {
          await markLinkUsed(tx, linkId, joined.booking.id, input.now);
          await input.onCommit?.(tx, joined);
          return joined;
        }
      }
      if (previous) {
        // Free the old slot first so the new range may overlap it (BKG-009).
        await deactivate(tx, previous.id);
        await tx
          .update(booking)
          .set({ status: "cancelled", manageTokenSealed: null, rescheduled: true, cancelledBy: "attendee", cancelledAt: new Date(input.now) })
          .where(eq(booking.id, previous.id));
      }
      const result = await insertBookings(tx, input, occurrences, token, assignment, previous);
      await markLinkUsed(tx, linkId, result.booking.id, input.now);
      if (input.holdToken) await tx.delete(slotReservation).where(eq(slotReservation.sessionTokenHash, hashToken(input.holdToken)));
      await input.onCommit?.(tx, result);
      return result;
    }));
  } catch (error) {
    if (pgCode(error) === "23P01") throw new BookingFailure("SLOT_UNAVAILABLE", "booking_conflict");
    if (pgCode(error) === "23505" && input.idempotencyKey) throw new BookingFailure("DUPLICATE");
    throw error;
  }
}

async function markLinkUsed(tx: Tx, linkId: string | null, bookingId: string, now: number) {
  if (linkId) await tx.update(privateLink).set({ usedAt: new Date(now), bookingId }).where(eq(privateLink.id, linkId));
}

async function insertBookings(
  tx: Tx,
  input: CreateBookingInput,
  occurrences: Occurrence[],
  token: string,
  assignment: Assignment,
  previous?: BookingRow,
): Promise<CreatedBooking> {
  const { eventType: et } = input;
  const host = assignment.organizer;
  // Guests: the booker's list, or on reschedule the previous booking's guests (BKG-009).
  const previousGuests = previous
    ? (await tx.select().from(attendee).where(eq(attendee.bookingId, previous.id))).filter((a) => a.isGuest).map((a) => a.email)
    : [];
  const guests = [...new Set((input.guests.length ? input.guests : previousGuests).map((g) => g.toLowerCase()))].filter(
    (g) => g !== input.booker.email.toLowerCase(),
  );
  const seated = Boolean(et.seatsPerSlot);
  const status = needsConfirmation(et, occurrences[0].start, input.now) ? "pending" : "accepted";
  const seriesId = occurrences.length > 1 ? newId() : null;
  // Seated bookings have no booker-level manage token: each seat gets its own (EVT-012).
  const manageTokenHash = hashToken(seated ? randomToken() : token);
  // Seats share one booking: its title must never name one attendee (EVT-012).
  const template = seated ? (et.eventNameTemplate?.includes("{attendee}") ? null : et.eventNameTemplate) ?? "{event} with {host}" : et.eventNameTemplate;
  // Collective bookings name the group (e.g. the team); round robin names the picked host.
  const hostLabel = assignment.hostIds.length > 1 && input.hostsLabel && !assignment.reason ? input.hostsLabel : host.name;
  const title = bookingTitle(template, { event: et.title, host: hostLabel, attendee: input.booker.name, location: input.location?.value ?? null });

  const rows: BookingRow[] = [];
  const allAttendees: AttendeeRow[] = [];
  for (const o of occurrences) {
    const id = newId();
    const [created] = await tx
      .insert(booking)
      .values({
        id,
        uid: randomToken(16),
        manageTokenHash,
        icalUid: previous?.icalUid ?? randomToken(16),
        sequence: previous ? previous.sequence + 1 : 0,
        eventTypeId: et.id,
        organizerId: host.id,
        status,
        title,
        startAt: new Date(o.start),
        endAt: new Date(o.end),
        bufferBeforeMinutes: et.bufferBeforeMinutes,
        bufferAfterMinutes: et.bufferAfterMinutes,
        timeZone: input.booker.timeZone,
        locationKind: input.location?.kind ?? null,
        locationValue: input.location?.value ?? null,
        // Seated bookings are shared: notes and answers live on each seat instead.
        notes: seated ? null : input.notes || null,
        rescheduledFromId: previous?.id ?? null,
        idempotencyKey: rows.length === 0 ? (input.idempotencyKey ?? null) : null,
        source: previous ? "reschedule" : (input.source ?? "web"),
        responses: seated ? {} : (input.responses ?? previous?.responses ?? {}),
        utm: input.utm ?? previous?.utm ?? null,
        recurringSeriesId: seriesId,
        assignmentReason: assignment.reason,
        routingFormResponseId: input.routingFormResponseId ?? previous?.routingFormResponseId ?? null,
      })
      .returning();
    const attendees = await tx
      .insert(attendee)
      .values([
        {
          id: newId(),
          bookingId: id,
          ...input.booker,
          email: input.booker.email.toLowerCase(),
          phone: input.booker.phone ?? null,
          isGuest: false,
          seatTokenHash: seated ? hashToken(token) : null,
          responses: seated ? (input.responses ?? {}) : null,
          notes: seated ? input.notes || null : null,
        },
        ...guests.map((email) => ({ id: newId(), bookingId: id, name: email, email, timeZone: input.booker.timeZone, locale: input.booker.locale, isGuest: true })),
      ])
      .returning();
    await tx.insert(bookingHost).values(
      [...new Set(assignment.hostIds)].map((userId) => ({
        bookingId: id,
        userId,
        blockedStart: new Date(o.start - et.bufferBeforeMinutes * MIN),
        blockedEnd: new Date(o.end + et.bufferAfterMinutes * MIN),
        active: true,
      })),
    );
    rows.push(created);
    allAttendees.push(...attendees);
  }
  const first = rows[0];
  return {
    booking: first,
    attendees: allAttendees.filter((a) => a.bookingId === first.id),
    token,
    previous,
    ...(seated && { seat: allAttendees.find((a) => a.bookingId === first.id && !a.isGuest) }),
    ...(seriesId && { series: rows }),
  };
}
