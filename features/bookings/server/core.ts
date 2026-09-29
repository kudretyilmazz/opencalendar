import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { attendee, booking, bookingHost } from "@/db/schema";
import type { HostInput, Interval } from "@/lib/availability/types";

/** Shared booking-service building blocks (errors, locks, validation windows). */

export const MIN = 60_000;
export const HOLD_TTL_MS = 5 * MIN; // BKG-006
export const ACTIVE = ["accepted", "pending", "awaiting_payment"] as const;

export type BookingRow = typeof booking.$inferSelect;
export type AttendeeRow = typeof attendee.$inferSelect;

export type BookingError =
  | "SLOT_UNAVAILABLE"
  | "INVALID_DURATION"
  | "TOO_MANY_GUESTS"
  | "DUPLICATE"
  | "NO_SCHEDULE"
  | "RESCHEDULE_NOT_ALLOWED"
  | "NOT_FOUND"
  | "ALREADY_CANCELLED"
  | "IN_PAST"
  /** Single-use link missing, used, expired or for another event type (EVT-015). */
  | "LINK_INVALID"
  /** The event type's policy forbids this (EVT-017), e.g. cancelling within the cutoff. */
  | "NOT_ALLOWED"
  | "INVALID_RECURRENCE"
  /** Accept/reject on a booking that is not pending (BKG-012). */
  | "NOT_PENDING";

export class BookingFailure extends Error {
  constructor(
    public readonly code: BookingError,
    public readonly detail?: string,
  ) {
    super(code);
    this.name = "BookingFailure";
  }
}

export const pgCode = (e: unknown) => (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;

/** Busy times from the host's conflict calendars for a window (AVL-006), injected by callers. */
export type ExternalBusyFn = (window: Interval) => Promise<readonly (Interval & { ref?: string })[]>;

export const VALIDATION_PAD_MS = 36 * 60 * MIN; // isSlotAvailable looks ±36 h around the slot

/**
 * External-calendar window used to validate one slot: ±36 h, snapped to whole UTC days so
 * requests for nearby start times share cache entries (no provider call per arbitrary `start`).
 */
export function validationWindow(slotStart: number): Interval {
  const day = 24 * 60 * MIN;
  return { start: Math.floor((slotStart - VALIDATION_PAD_MS) / day) * day, end: Math.ceil((slotStart + VALIDATION_PAD_MS) / day) * day };
}

/** Starts that can never be bookable are rejected before any I/O (past, or absurdly far out). */
export function assertPlausibleStart(start: number, now: number) {
  if (start < now || start > now + 2 * 366 * 24 * 60 * MIN) throw new BookingFailure("SLOT_UNAVAILABLE", "outside_window");
}

export async function withExternal(host: HostInput, fn: ExternalBusyFn | undefined, window: Interval): Promise<HostInput> {
  return fn ? { ...host, externalBusy: await fn(window) } : host;
}


export async function lockHost(tx: Tx, hostId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`host:${hostId}`}))`);
}

/** Locks several hosts in a fixed (sorted) order, so two team bookings can't deadlock. */
export async function lockHosts(tx: Tx, hostIds: readonly string[]) {
  for (const id of [...new Set(hostIds)].toSorted()) await lockHost(tx, id);
}

/**
 * "This user is a host of the booking" (organizer or collective co-host, TEAM-004). Host-side
 * actions and the dashboard use it instead of `organizer_id = user`.
 */
export const isHostOf = (userId: string) =>
  sql`EXISTS (SELECT 1 FROM booking_host bh WHERE bh.booking_id = "booking"."id" AND bh.user_id = ${userId})`;

export async function deactivate(tx: Tx, bookingId: string) {
  await tx.update(bookingHost).set({ active: false }).where(eq(bookingHost.bookingId, bookingId));
}


/** EVT-011: pending until the host accepts, optionally only for bookings starting soon. */
export function needsConfirmation(et: { requiresConfirmation: boolean; confirmationThresholdMinutes: number | null }, start: number, now: number): boolean {
  if (!et.requiresConfirmation) return false;
  return et.confirmationThresholdMinutes === null || start - now <= et.confirmationThresholdMinutes * MIN;
}
