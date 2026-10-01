"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromDrizzle } from "pg-boss";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { getEnv } from "@/lib/env";
import { enqueue } from "@/lib/jobs/enqueue";
import { sealEmail } from "@/lib/jobs/queues";
import { errorSummary, logger } from "@/lib/logger";
import { requestReschedule, rescheduleRequestEmail } from "./reschedule-request";
import { BookingFailure, cancelByHost } from "./service";

const schema = z.object({
  bookingId: z.string().min(1).max(64),
  reason: z.string().trim().max(500).optional(),
});

/** Host cancels a booking (BKG-010). Only a host of the booking can; the service enforces it. */
export async function hostCancelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = schema.safeParse({ bookingId: formData.get("bookingId"), reason: formData.get("reason") || undefined });
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  try {
    await cancelByHost(getDb(), {
      hostId: user.id,
      bookingId: parsed.data.bookingId,
      reason: parsed.data.reason,
      now: Date.now(),
      // Queued in the cancelling transaction: the calendar cleanup and emails can't be lost.
      onCommit: async (tx, cancelled) => {
        await enqueue("bookingProcess", { bookingId: cancelled.id, event: "cancelled" }, { db: fromDrizzle(tx, sql) });
      },
    });
  } catch (error) {
    if (error instanceof BookingFailure) return { status: "error", message: "This booking can't be cancelled anymore." };
    throw error;
  }
  revalidatePath("/bookings");
  // The booking leaves the Upcoming list, so the confirmation is shown at page level.
  redirect("/bookings?notice=cancelled");
}

/**
 * Host asks the invitee to pick a new time (BKG-010). The booking is NOT cancelled: it stays on
 * its current time, marked "new time requested", until the invitee reschedules through the
 * emailed link. Asking again re-sends the email.
 */
export async function requestRescheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = schema.safeParse({ bookingId: formData.get("bookingId"), reason: formData.get("reason") || undefined });
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  const env = getEnv();
  const cipher = cipherFromEnv(env);
  const result = await requestReschedule(getDb(), cipher, {
    hostId: user.id,
    bookingId: parsed.data.bookingId,
    message: parsed.data.reason,
    now: Date.now(),
    appUrl: env.APP_URL,
  });
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "NOT_FOUND"
          ? "This booking can't be rescheduled anymore."
          : "The invitee can't move this booking online (recurring, seated, or rescheduling is turned off). Contact them directly or cancel it.",
    };
  }
  const email = rescheduleRequestEmail(result);
  if (!email) return { status: "error", message: "This booking has no invitee to email." };
  try {
    await enqueue("emailSend", sealEmail(cipher, email));
  } catch (error) {
    logger.error("booking.reschedule_request_email_failed", { bookingId: result.details.booking.id, ...errorSummary(error) });
    return { status: "error", message: "The email couldn't be sent. Please try again." };
  }
  logger.info("booking.reschedule_requested", { bookingId: result.details.booking.id });
  revalidatePath("/bookings");
  return { status: "success", message: `We emailed ${email.props.attendeeName} a link to pick a new time. The meeting stays booked until they do.` };
}
