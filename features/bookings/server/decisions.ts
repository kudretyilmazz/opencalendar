import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { Database, Tx } from "@/db/client";
import { attendee, booking, eventType } from "@/db/schema";
import { hashToken, tokenMatches } from "@/lib/ids";
import { ACTIVE, type AttendeeRow, BookingFailure, type BookingRow, deactivate, isHostOf, MIN } from "./core";
import { refreshDisplay } from "./host-data";

/**
 * Host decisions and attendee self-service beyond plain cancel (M3): accept/reject pending
 * bookings (BKG-012), no-show marks (BKG-013), seat cancellation (EVT-012), series cancellation
 * (EVT-013) and the event type's cancellation policy (EVT-017).
 */

export type DecisionHook = (tx: Tx, row: BookingRow) => Promise<void>;

/** Applies a decision to a pending booking — and to the rest of its series (EVT-013). */
async function decide(
  db: Database,
  input: { bookingId: string; hostId: string; now: number; onCommit?: DecisionHook },
  apply: (row: BookingRow) => Partial<BookingRow>,
  release: boolean,
): Promise<BookingRow> {
  return refreshDisplay(db.transaction(async (tx) => {
    const [probe] = await tx
      .select({ seriesId: booking.recurringSeriesId })
      .from(booking)
      .where(and(eq(booking.id, input.bookingId), isHostOf(input.hostId)));
    if (!probe) throw new BookingFailure("NOT_FOUND");
    // Series rows are always locked in start order (same as series cancel): no deadlocks.
    const locked = probe.seriesId ? await lockSeries(tx, probe.seriesId) : await tx.select().from(booking).where(eq(booking.id, input.bookingId)).for("update");
    const row = locked.find((r) => r.id === input.bookingId);
    if (!row) throw new BookingFailure("NOT_FOUND");
    if (row.status !== "pending") throw new BookingFailure("NOT_PENDING");
    // Accepting a request whose time has passed would send a stale invitation.
    if (!release && row.startAt.getTime() <= input.now) throw new BookingFailure("IN_PAST");
    const rows = locked.filter((r) => r.status === "pending");
    let first = row;
    for (const r of rows) {
      if (release) await deactivate(tx, r.id);
      const [next] = await tx.update(booking).set({ ...apply(r), pendingTokenSealed: null }).where(eq(booking.id, r.id)).returning();
      if (r.id === row.id) first = next;
    }
    // The hook still gets the sealed token (the committed row no longer has it).
    await input.onCommit?.(tx, { ...first, pendingTokenSealed: row.pendingTokenSealed });
    return first;
  }));
}

/** BKG-012: a pending booking becomes accepted (it already blocks the host's time). */
export function acceptBooking(db: Database, input: { bookingId: string; hostId: string; now: number; onCommit?: DecisionHook }) {
  return decide(db, input, () => ({ status: "accepted", decidedAt: new Date(input.now) }), false);
}

/** BKG-012: a pending booking is rejected and its time is released. */
export function rejectBooking(db: Database, input: { bookingId: string; hostId: string; reason?: string; now: number; onCommit?: DecisionHook }) {
  return decide(
    db,
    input,
    (row) => ({ status: "rejected", manageTokenSealed: null, decidedAt: new Date(input.now), rejectionReason: input.reason || null, sequence: row.sequence + 1 }),
    true,
  );
}

/** BKG-013: no-show marks on a booking that has started, for the host or one attendee. */
export async function setNoShow(
  db: Database,
  input: { bookingId: string; hostId: string; target: { attendeeId: string } | "host"; noShow: boolean; now: number },
): Promise<void> {
  const [row] = await db
    .select({ id: booking.id, startAt: booking.startAt, status: booking.status })
    .from(booking)
    .where(and(eq(booking.id, input.bookingId), isHostOf(input.hostId)));
  if (!row || row.status !== "accepted") throw new BookingFailure("NOT_FOUND");
  if (row.startAt.getTime() > input.now) throw new BookingFailure("NOT_ALLOWED");
  if (input.target === "host") {
    await db.update(booking).set({ hostNoShow: input.noShow }).where(eq(booking.id, row.id));
    return;
  }
  const updated = await db
    .update(attendee)
    .set({ noShow: input.noShow })
    .where(and(eq(attendee.id, input.target.attendeeId), eq(attendee.bookingId, row.id)))
    .returning({ id: attendee.id });
  if (!updated.length) throw new BookingFailure("NOT_FOUND");
}

type Policy = { disableCancelling: boolean; cancelCutoffMinutes: number | null };

/** EVT-017: may the attendee cancel this booking themselves right now? */
export function attendeeMayCancel(policy: Policy, start: number, now: number): boolean {
  if (policy.disableCancelling) return false;
  return policy.cancelCutoffMinutes === null || start - now >= policy.cancelCutoffMinutes * MIN;
}

export async function policyFor(db: Database | Tx, eventTypeId: string) {
  const [row] = await db
    .select({
      disableCancelling: eventType.disableCancelling,
      disableRescheduling: eventType.disableRescheduling,
      cancelCutoffMinutes: eventType.cancelCutoffMinutes,
      seatsPerSlot: eventType.seatsPerSlot,
      seatsShowAttendees: eventType.seatsShowAttendees,
    })
    .from(eventType)
    .where(eq(eventType.id, eventTypeId));
  return row;
}

/** The seat a seat token belongs to (EVT-012), or null. */
export async function findSeat(db: Database, bookingId: string, token: string | null | undefined) {
  if (!token || token.length > 256) return null;
  const [seat] = await db
    .select()
    .from(attendee)
    .where(and(eq(attendee.bookingId, bookingId), eq(attendee.seatTokenHash, hashToken(token))));
  return seat ?? null;
}

/**
 * EVT-012: an attendee gives up their seat. The last seat cancels the whole booking, which the
 * caller learns from `bookingCancelled`.
 */
export async function cancelSeat(
  db: Database,
  input: { uid: string; token: string; now: number; onCommit?: (tx: Tx, row: BookingRow, seat: AttendeeRow, bookingCancelled: boolean) => Promise<void> },
): Promise<{ booking: BookingRow; seatId: string; bookingCancelled: boolean }> {
  return refreshDisplay(db.transaction(async (tx) => {
    const [row] = await tx.select().from(booking).where(eq(booking.uid, input.uid)).for("update");
    if (!row) throw new BookingFailure("NOT_FOUND");
    const [seat] = await tx
      .select()
      .from(attendee)
      .where(and(eq(attendee.bookingId, row.id), eq(attendee.seatTokenHash, hashToken(input.token))));
    if (!seat) throw new BookingFailure("NOT_FOUND");
    if (!(ACTIVE as readonly string[]).includes(row.status)) throw new BookingFailure("ALREADY_CANCELLED");
    if (row.endAt.getTime() <= input.now) throw new BookingFailure("IN_PAST");
    const policy = await policyFor(tx, row.eventTypeId);
    if (policy && !attendeeMayCancel(policy, row.startAt.getTime(), input.now)) throw new BookingFailure("NOT_ALLOWED");
    const remaining = await tx.select({ id: attendee.id }).from(attendee).where(and(eq(attendee.bookingId, row.id), eq(attendee.isGuest, false)));
    const last = remaining.length <= 1;
    let next = row;
    if (last) {
      await deactivate(tx, row.id);
      [next] = await tx
        .update(booking)
        .set({ status: "cancelled", manageTokenSealed: null, cancelledBy: "attendee", cancelledAt: new Date(input.now), sequence: row.sequence + 1 })
        .where(eq(booking.id, row.id))
        .returning();
    } else {
      await tx.delete(attendee).where(eq(attendee.id, seat.id));
      // A higher SEQUENCE makes the seat's CANCEL apply in calendar clients (RFC 5546).
      [next] = await tx.update(booking).set({ sequence: row.sequence + 1 }).where(eq(booking.id, row.id)).returning();
    }
    await input.onCommit?.(tx, next, seat, last);
    return { booking: next, seatId: seat.id, bookingCancelled: last };
  }));
}

/** Locks every occurrence of a series, in start order (the one lock order used everywhere). */
export function lockSeries(tx: Tx, seriesId: string): Promise<BookingRow[]> {
  return tx.select().from(booking).where(eq(booking.recurringSeriesId, seriesId)).orderBy(asc(booking.startAt), asc(booking.id)).for("update");
}

/** EVT-013: the remaining (future, active) occurrences of a series, oldest first. */
export async function remainingOccurrences(db: Database | Tx, seriesId: string, now: number): Promise<BookingRow[]> {
  return db
    .select()
    .from(booking)
    .where(and(eq(booking.recurringSeriesId, seriesId), inArray(booking.status, [...ACTIVE]), gt(booking.startAt, new Date(now))))
    .orderBy(asc(booking.startAt));
}

/** The manage token of a series is shared by its occurrences (one emailed link manages all). */
export const seriesTokenMatches = (token: string | null | undefined, row: BookingRow) => tokenMatches(token, row.manageTokenHash);
