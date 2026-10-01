import { and, eq, gt, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { booking, eventType } from "@/db/schema";
import type { Cipher } from "@/lib/crypto/encryption";
import type { EmailRequest } from "@/lib/jobs/queues";
import { prefers12Hour } from "@/lib/format";
import { canRequestReschedule } from "../reschedulable";
import { bookingPagePath } from "./booking-path";
import { isHostOf } from "./core";
import { bookingLocation, manageUrl } from "./notifications";
import { type BookingDetails, findBookingById } from "./service";

/** Bookings the attendee can move to another time themselves (BKG-009): same rules as their own Reschedule button. */
export const RESCHEDULABLE_STATUSES = ["accepted", "pending"] as const;

export type RescheduleRequestRefusal = "NOT_FOUND" | "NOT_MOVABLE";
export type RescheduleRequest = { ok: true; details: BookingDetails; rescheduleUrl: string; manageUrl: string } | { ok: false; reason: RescheduleRequestRefusal };

/**
 * The host asks the booker to pick a new time (BKG-010). Nothing is cancelled: the booking keeps
 * its time and is marked as "new time requested" until the booker reschedules it through the
 * link (which marks the old booking rescheduled, BKG-009). The link carries the booker's own
 * manage token, recovered from its sealed copy (NTF-005). Only a host of the booking may ask.
 */
export async function requestReschedule(
  db: Database,
  cipher: Cipher,
  input: { hostId: string; bookingId: string; message?: string; now: number; appUrl: string },
): Promise<RescheduleRequest> {
  const prepared = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ b: booking, disableRescheduling: eventType.disableRescheduling, seatsPerSlot: eventType.seatsPerSlot })
      .from(booking)
      .innerJoin(eventType, eq(eventType.id, booking.eventTypeId))
      .where(and(eq(booking.id, input.bookingId), isHostOf(input.hostId), inArray(booking.status, [...RESCHEDULABLE_STATUSES]), gt(booking.endAt, new Date(input.now))))
      .for("update", { of: booking });
    if (!row) return { ok: false, reason: "NOT_FOUND" } as const;
    if (!canRequestReschedule(row.b, row) || !row.b.manageTokenSealed) return { ok: false, reason: "NOT_MOVABLE" } as const;
    const path = await bookingPagePath(tx, row.b.eventTypeId, row.b.organizerId);
    if (!path) return { ok: false, reason: "NOT_MOVABLE" } as const;
    const token = cipher.decrypt(row.b.manageTokenSealed, row.b.id);
    await tx
      .update(booking)
      .set({ rescheduleRequestedAt: new Date(input.now), rescheduleRequestMessage: input.message || null })
      .where(eq(booking.id, row.b.id));
    const uid = encodeURIComponent(row.b.uid);
    return {
      ok: true,
      rescheduleUrl: `${input.appUrl}${path}?reschedule=${uid}&token=${encodeURIComponent(token)}`,
      manageUrl: manageUrl(input.appUrl, row.b.uid, token),
    } as const;
  });
  if (!prepared.ok) return prepared;
  const details = await findBookingById(db, input.bookingId);
  if (!details) return { ok: false, reason: "NOT_FOUND" };
  return { ...prepared, details };
}

/** The email to the booker (never guests): in their own time zone and clock (I18N-001). */
export function rescheduleRequestEmail(request: Extract<RescheduleRequest, { ok: true }>): Extract<EmailRequest, { template: "reschedule-requested" }> | null {
  const { details } = request;
  const b = details.booking;
  const booker = details.attendees.find((a) => !a.isGuest);
  if (!booker) return null;
  return {
    to: booker.email,
    template: "reschedule-requested",
    props: {
      audience: "attendee",
      title: b.title,
      start: b.startAt.getTime(),
      end: b.endAt.getTime(),
      timeZone: booker.timeZone,
      locale: booker.locale,
      hour12: prefers12Hour(booker.locale),
      hostName: details.host.name,
      attendeeName: booker.name,
      attendeeEmail: booker.email,
      ...(bookingLocation(b) && { location: bookingLocation(b) }),
      ...(b.rescheduleRequestMessage && { message: b.rescheduleRequestMessage }),
      rescheduleUrl: request.rescheduleUrl,
      manageUrl: request.manageUrl,
    },
  };
}
