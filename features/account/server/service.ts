import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { user } from "@/db/schema";
import { BookingFailure, type BookingDetails, cancelBySystem, listFutureActiveBookingIds, lockHost } from "@/features/bookings/server/service";
import { leaveAllTeams } from "@/features/teams/server/handover";
import { errorSummary, logger } from "@/lib/logger";

export const DELETION_REASON = "The host deleted their account.";

/**
 * Deletes an account (ADM-006): cancels the user's upcoming bookings first so attendees can be
 * notified, then hard-deletes the user. Sessions, OAuth accounts, schedules, event types,
 * bookings and attendee records cascade with it; integrations (M2) will cascade too.
 * Returns the cancelled bookings so the caller can email attendees.
 *
 * External events are removed inline (a few at a time), because the credentials needed to do so
 * are deleted with the user; a queued job would find them gone. Failures are logged and don't
 * block the deletion — the user asked for their data to go.
 */
const CLEANUP_CONCURRENCY = 4;

async function cancelOne(db: Database, bookingId: string, now: number, cleanupExternal?: (bookingId: string) => Promise<unknown>) {
  let details: BookingDetails;
  try {
    details = await cancelBySystem(db, { bookingId, reason: DELETION_REASON, now });
  } catch (error) {
    // Cancelled concurrently or just ended: nothing to notify, keep deleting.
    if (error instanceof BookingFailure) return null;
    throw error;
  }
  try {
    await cleanupExternal?.(bookingId);
  } catch (error) {
    logger.warn("account.external_cleanup_failed", { bookingId, ...errorSummary(error) });
  }
  return details;
}

export async function deleteAccount(
  db: Database,
  userId: string,
  now: number,
  cleanupExternal?: (bookingId: string) => Promise<unknown>,
): Promise<BookingDetails[]> {
  // Disable first: the public page and booking endpoints stop accepting new bookings, so no
  // booking can slip in between the cancellation pass and the delete.
  await db.update(user).set({ disabledAt: new Date(now) }).where(eq(user.id, userId));
  // Wait out bookings already inside their transaction; later ones see disabledAt and fail.
  await db.transaction((tx) => lockHost(tx, userId));
  const ids = await listFutureActiveBookingIds(db, userId, now);
  const cancelled: BookingDetails[] = [];
  for (let i = 0; i < ids.length; i += CLEANUP_CONCURRENCY) {
    const batch = await Promise.all(ids.slice(i, i + CLEANUP_CONCURRENCY).map((id) => cancelOne(db, id, now, cleanupExternal)));
    cancelled.push(...batch.filter((d): d is BookingDetails => d !== null));
  }
  // Team event types, workflows and routing forms they created stay with their teams (M4).
  await leaveAllTeams(db, userId);
  await db.delete(user).where(eq(user.id, userId));
  return cancelled;
}
