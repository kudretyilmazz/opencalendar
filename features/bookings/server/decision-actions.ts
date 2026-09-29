"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { fromDrizzle } from "pg-boss";
import { z } from "zod";
import { getDb, type Tx } from "@/db/client";
import { booking, eventType, user } from "@/db/schema";
import { emitWebhooks } from "@/features/webhooks/server/emit";
import type { ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { enqueue } from "@/lib/jobs/enqueue";
import { logger } from "@/lib/logger";
import { verifyAction } from "@/lib/security/signed-links";
import { BookingFailure, type BookingRow } from "./core";
import { acceptBooking, rejectBooking, setNoShow } from "./decisions";
import { bookingPagePath } from "./booking-path";

/** Host decisions (BKG-012) and no-show marks (BKG-013). */

const decisionSchema = z.object({
  bookingId: z.string().min(1).max(64),
  decision: z.enum(["accept", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

const MESSAGES: Partial<Record<BookingFailure["code"], string>> = {
  NOT_PENDING: "This booking was already accepted, rejected or cancelled.",
  NOT_FOUND: "This booking no longer exists.",
  NOT_ALLOWED: "No-shows can only be marked once the meeting has started.",
  IN_PAST: "This request's time has already passed. Reject it or ask the invitee to book again.",
};

function onDecided(decision: "accept" | "reject", rebookUrl?: string) {
  return async (tx: Tx, row: BookingRow) => {
    const cipher = cipherFromEnv(getEnv());
    const token = decision === "accept" && row.pendingTokenSealed ? cipher.decrypt(row.pendingTokenSealed, row.id) : null;
    await enqueue(
      "bookingProcess",
      {
        bookingId: row.id,
        event: decision === "accept" ? "accepted" : "rejected",
        ...(token && { sealedToken: cipher.encrypt(token) }),
        ...(row.recurringSeriesId && { seriesId: row.recurringSeriesId }),
        ...(rebookUrl && { rebookUrl }),
      },
      { db: fromDrizzle(tx, sql) },
    );
  };
}

async function rebookUrlFor(_hostUsername: string | null | undefined, bookingId: string): Promise<string | undefined> {
  const db = getDb();
  const [row] = await db
    .select({ eventTypeId: booking.eventTypeId, organizerId: booking.organizerId, hidden: eventType.hidden })
    .from(booking)
    .innerJoin(eventType, eq(eventType.id, booking.eventTypeId))
    .where(eq(booking.id, bookingId));
  if (!row || row.hidden) return undefined;
  const path = await bookingPagePath(db, row.eventTypeId, row.organizerId);
  return path ? `${getEnv().APP_URL}${path}` : undefined;
}

async function applyDecision(input: { bookingId: string; hostId: string; hostUsername?: string | null; decision: "accept" | "reject"; reason?: string }) {
  const db = getDb();
  const now = Date.now();
  if (input.decision === "accept") {
    await acceptBooking(db, { bookingId: input.bookingId, hostId: input.hostId, now, onCommit: onDecided("accept") });
  } else {
    const rebookUrl = await rebookUrlFor(input.hostUsername, input.bookingId);
    await rejectBooking(db, { bookingId: input.bookingId, hostId: input.hostId, reason: input.reason, now, onCommit: onDecided("reject", rebookUrl) });
  }
}

/** Dashboard accept/reject (BKG-012). */
export async function decideBookingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireUser();
  const parsed = decisionSchema.safeParse({ bookingId: formData.get("bookingId"), decision: formData.get("decision"), reason: formData.get("reason") || undefined });
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  try {
    await applyDecision({ ...parsed.data, hostId: me.id, hostUsername: me.username });
  } catch (error) {
    if (error instanceof BookingFailure) return { status: "error", message: MESSAGES[error.code] ?? "That didn't work." };
    throw error;
  }
  revalidatePath("/bookings");
  return { status: "success", message: parsed.data.decision === "accept" ? "Booking accepted. The invitee has been notified." : "Booking rejected. The invitee has been notified." };
}

const signedSchema = z.object({
  uid: z.string().min(1).max(64),
  decision: z.enum(["accept", "reject"]),
  exp: z.coerce.number().int(),
  sig: z.string().min(10).max(100),
  reason: z.string().trim().max(500).optional(),
});

/**
 * One-click decision from the host's email (BKG-012). The emailed link opens a confirmation
 * page (GET never changes anything, so link scanners can't accept bookings); this POST verifies
 * the signature, which binds booking, action and expiry.
 */
export async function decideBySignatureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signedSchema.safeParse({
    uid: formData.get("uid"),
    decision: formData.get("decision"),
    exp: formData.get("exp"),
    sig: formData.get("sig"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { status: "error", message: "This link is invalid." };
  const db = getDb();
  const [row] = await db.select({ id: booking.id, organizerId: booking.organizerId }).from(booking).where(eq(booking.uid, parsed.data.uid));
  const valid = row && verifyAction(getEnv().AUTH_SECRET, { subject: row.id, action: parsed.data.decision, expiresAt: parsed.data.exp }, parsed.data.sig, Date.now());
  if (!row || !valid) return { status: "error", message: "This link is invalid or has expired. Open your bookings dashboard instead." };
  const [host] = await db.select({ username: user.username }).from(user).where(eq(user.id, row.organizerId));
  try {
    await applyDecision({ bookingId: row.id, hostId: row.organizerId, hostUsername: host?.username, decision: parsed.data.decision, reason: parsed.data.reason });
  } catch (error) {
    if (error instanceof BookingFailure) return { status: "error", message: MESSAGES[error.code] ?? "That didn't work." };
    throw error;
  }
  return { status: "success", message: parsed.data.decision === "accept" ? "Accepted. The invitee has been notified." : "Rejected. The invitee has been notified." };
}

const noShowSchema = z.object({
  bookingId: z.string().min(1).max(64),
  target: z.union([z.literal("host"), z.string().min(1).max(64)]),
  noShow: z.boolean(),
});

/** BKG-013: marks the host or one attendee as no-show; webhooks are told. */
export async function noShowAction(raw: unknown): Promise<ActionState> {
  const me = await requireUser();
  const parsed = noShowSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  const { bookingId, target, noShow } = parsed.data;
  try {
    await setNoShow(getDb(), { bookingId, hostId: me.id, target: target === "host" ? "host" : { attendeeId: target }, noShow, now: Date.now() });
  } catch (error) {
    if (error instanceof BookingFailure) return { status: "error", message: MESSAGES[error.code] ?? "That didn't work." };
    throw error;
  }
  await emitWebhooks(
    { db: getDb(), enqueue: async (deliveryId) => void (await enqueue("webhookDeliver", { deliveryId })) },
    { trigger: "BOOKING_NO_SHOW_UPDATED", bookingId },
  ).catch((error) => logger.error("webhooks.no_show_emit_failed", { bookingId, message: error instanceof Error ? error.message : "error" }));
  revalidatePath("/bookings");
  return { status: "success", message: "Saved." };
}
