"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromDrizzle } from "pg-boss";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { enqueue } from "@/lib/jobs/enqueue";
import { BookingFailure, cancelByHost } from "./service";
import { bookingPagePath } from "./booking-path";

const schema = z.object({
  bookingId: z.string().min(1).max(64),
  reason: z.string().trim().max(500).optional(),
  mode: z.enum(["cancel", "reschedule"]),
});

/**
 * Host cancels a booking, or asks the attendee to pick a new time (cancel + rebook link)
 * (BKG-010). Only the organizer can do this; the service enforces ownership.
 */
export async function hostCancelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    bookingId: formData.get("bookingId"),
    reason: formData.get("reason") || undefined,
    mode: formData.get("mode"),
  });
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  try {
    await cancelByHost(getDb(), {
      hostId: user.id,
      bookingId: parsed.data.bookingId,
      reason: parsed.data.reason ?? (parsed.data.mode === "reschedule" ? "The host asked to find a new time." : undefined),
      now: Date.now(),
      // Queued in the cancelling transaction: the calendar cleanup and emails can't be lost.
      onCommit: async (tx, cancelled) => {
        const path = parsed.data.mode === "reschedule" ? await bookingPagePath(tx, cancelled.eventTypeId, cancelled.organizerId) : null;
        const rebookUrl = path ? `${getEnv().APP_URL}${path}` : undefined;
        await enqueue("bookingProcess", { bookingId: cancelled.id, event: "cancelled", rebookUrl }, { db: fromDrizzle(tx, sql) });
      },
    });
  } catch (error) {
    if (error instanceof BookingFailure) return { status: "error", message: "This booking can't be cancelled anymore." };
    throw error;
  }
  revalidatePath("/bookings");
  // The booking leaves the Upcoming list, so the confirmation is shown at page level.
  redirect(`/bookings?notice=${parsed.data.mode === "reschedule" ? "reschedule_requested" : "cancelled"}`);
}
