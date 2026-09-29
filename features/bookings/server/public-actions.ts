"use server";

import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { fromDrizzle } from "pg-boss";
import { getDb, type Tx } from "@/db/client";
import { booking, routingFormResponse } from "@/db/schema";
import { fieldErrors } from "@/lib/actions";
import { clientIp, overLimit } from "@/lib/security/public-limits";
import { externalBusyFor } from "@/features/calendars/server/runtime";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { getEnv } from "@/lib/env";
import { enqueue } from "@/lib/jobs/enqueue";
import { sealEmail } from "@/lib/jobs/queues";
import { verifyCaptcha } from "@/lib/security/captcha";
import { LocationChoiceError, resolveLocation } from "../location";
import { cancelBookingSchema, type CreateBookingPayload, createBookingSchema, holdSchema } from "../schemas";
import { answersSchema, type Answers } from "../responses";
import { bookingRedirectUrl } from "../redirect";
import { isUsablePrivateLink } from "@/features/event-types/server/private-links";
import { cancelSeat, findSeat } from "./decisions";
import { buildBookingEmails } from "./notifications";
import { BookingFailure, cancelByAttendee, cancelSeriesByAttendee, createBooking, findBookingById, holdSlot } from "./service";
import { resolveBookingTarget, type TargetKey } from "./targets";

/**
 * Public (unauthenticated) booking actions. Every input is validated here; ownership is
 * established by username + slug, and booking changes by the manage token (BKG-011).
 */

export type PublicResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

const TOO_MANY = { ok: false as const, message: "Too many requests. Please wait a minute and try again." };

const FAILURE_MESSAGES: Record<string, string> = {
  SLOT_UNAVAILABLE: "Sorry, that time was just taken. Please pick another one.",
  INVALID_DURATION: "That duration isn't available for this event.",
  TOO_MANY_GUESTS: "Too many guests for this event.",
  DUPLICATE: "This booking was already submitted. Check your email for the confirmation.",
  NO_SCHEDULE: "This host hasn't set up their availability yet.",
  RESCHEDULE_NOT_ALLOWED: "This booking can no longer be rescheduled.",
  NOT_FOUND: "We couldn't find this booking.",
  ALREADY_CANCELLED: "This booking is already cancelled.",
  IN_PAST: "This meeting has already taken place.",
  LINK_INVALID: "This booking link is invalid, expired or has already been used.",
  NOT_ALLOWED: "The host doesn't allow changing this booking online anymore. Please contact them directly.",
  INVALID_RECURRENCE: "That number of occurrences isn't available for this event.",
};

async function resolve(key: TargetKey) {
  const db = getDb();
  const target = await resolveBookingTarget(db, key);
  return target ? { db, target, host: target.host, eventType: target.eventType } : null;
}

/** RTE-004: only a response that routed to this very event type is linked to the booking. */
async function routingResponseFor(db: ReturnType<typeof getDb>, id: string | undefined, eventTypeId: string): Promise<string | null> {
  if (!id) return null;
  const [row] = await db.select({ action: routingFormResponse.action }).from(routingFormResponse).where(eq(routingFormResponse.id, id));
  if (row?.action.kind !== "event_type" || row.action.eventTypeId !== eventTypeId) return null;
  // One response leads to one booking: a shared or replayed URL doesn't attach it again.
  const [used] = await db.select({ id: booking.id }).from(booking).where(eq(booking.routingFormResponseId, id)).limit(1);
  return used ? null : id;
}

export async function holdSlotAction(raw: unknown): Promise<PublicResult> {
  if (await overLimit("hold", clientIp(await headers()))) return TOO_MANY;
  const parsed = holdSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const target = await resolve(parsed.data);
  if (!target) return { ok: false, message: FAILURE_MESSAGES.NOT_FOUND };
  // Holds are per host; a team slot's host is only known at booking time, so none is taken.
  if (target.target.hosts) return { ok: true };
  if (target.eventType.linkOnly && !(await isUsablePrivateLink(target.db, target.eventType.id, parsed.data.link, Date.now()))) {
    return { ok: false, message: FAILURE_MESSAGES.LINK_INVALID };
  }
  try {
    await holdSlot(target.db, {
      host: target.host,
      eventType: target.eventType,
      start: parsed.data.start,
      durationMin: parsed.data.duration,
      token: parsed.data.holdToken,
      now: Date.now(),
      externalBusy: externalBusyFor(target.host, target.eventType.id),
    });
  } catch (error) {
    if (error instanceof BookingFailure) return { ok: false, message: FAILURE_MESSAGES[error.code] ?? "Unavailable." };
    throw error;
  }
  return { ok: true };
}

type CreateResult = PublicResult<{ redirect: string; external?: boolean; uid: string; status: string }>;

/** Answers validated against the event type's own questions (EVT-009). */
function validateAnswers(questions: Parameters<typeof answersSchema>[0], raw: unknown): { ok: true; answers: Answers } | { ok: false; result: CreateResult } {
  const parsed = answersSchema(questions).safeParse(raw);
  if (parsed.success) return { ok: true, answers: parsed.data };
  const errors = Object.fromEntries(parsed.error.issues.map((i) => [`answers.${String(i.path[0])}`, i.message]));
  return { ok: false, result: { ok: false, message: "Please check the form.", fieldErrors: errors } };
}

export async function createBookingAction(raw: CreateBookingPayload): Promise<CreateResult> {
  const parsed = createBookingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;
  if ((await overLimit("book", clientIp(await headers()))) || (await overLimit("bookPerEmail", input.booker.email))) {
    return TOO_MANY;
  }

  const env = getEnv();
  if (env.CAPTCHA === "altcha" && !(await verifyCaptcha(getDb(), env.AUTH_SECRET, input.captcha))) {
    return { ok: false, message: "We couldn't verify this request. Please try again." };
  }
  // Guests get emails too: each address has its own "as guest" limit, so the form can't be used to
  // mail-bomb someone — and listing someone as a guest never uses up their own booking quota.
  for (const guest of new Set(input.guests.map((g) => g.toLowerCase()))) {
    if (await overLimit("bookAsGuest", guest)) return TOO_MANY;
  }
  const target = await resolve(input);
  if (!target) return { ok: false, message: "This booking page is not available." };
  const teamHosts = target.target.hosts;
  const answers = validateAnswers(target.eventType.questions, input.responses);
  if (!answers.ok) return answers.result;
  let location;
  try {
    location = resolveLocation(
      target.eventType.locations,
      { index: input.locationIndex, phone: input.phone },
      { jitsiBaseUrl: getEnv().JITSI_BASE_URL, eventSlug: target.eventType.slug },
    );
  } catch (error) {
    if (error instanceof LocationChoiceError) {
      return error.field === "phone"
        ? { ok: false, message: "Please check the form.", fieldErrors: { phone: "Enter your phone number" } }
        : { ok: false, message: "Please choose a location." };
    }
    throw error;
  }
  const cipher = cipherFromEnv(getEnv());
  try {
    const created = await createBooking(target.db, {
      host: target.host,
      eventType: target.eventType,
      start: input.start,
      durationMin: input.duration,
      booker: { ...input.booker, phone: location?.kind === "phone_attendee" ? input.phone : undefined },
      guests: input.guests.filter((g) => g !== input.booker.email),
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
      holdToken: input.holdToken,
      reschedule: input.reschedule,
      location,
      now: Date.now(),
      externalBusy: externalBusyFor(target.host, target.eventType.id),
      ...(teamHosts && {
        hosts: teamHosts,
        hostsLabel: target.target.displayName,
        externalBusyFor: (hostId: string) => externalBusyFor(teamHosts.find((h) => h.host.id === hostId)!.host, target.eventType.id),
      }),
      routingFormResponseId: await routingResponseFor(target.db, input.routing, target.eventType.id),
      responses: answers.answers,
      utm: input.utm ?? null,
      source: input.embed ? "embed" : "web",
      privateLinkToken: input.link,
      recurringCount: input.recurringCount,
      // Side effects (calendar sync, meeting links, emails) are queued in the same transaction.
      onCommit: async (tx, result) => {
        const event = result.previous ? "rescheduled" : result.booking.status === "pending" ? "requested" : "created";
        // Seal the booker's manage token on every row (occurrences share it) so reminders can
        // carry working cancel/reschedule links (NTF-005). Seats have per-seat tokens: not sealed.
        if (!result.seat) {
          for (const row of result.series ?? [result.booking]) {
            await tx.update(booking).set({ manageTokenSealed: cipher.encrypt(result.token, row.id) }).where(eq(booking.id, row.id));
          }
        }
        if (result.booking.status === "pending") {
          // Kept (encrypted) until the host decides, so the acceptance email can carry the manage link.
          await tx.update(booking).set({ pendingTokenSealed: cipher.encrypt(result.token, result.booking.id) }).where(eq(booking.id, result.booking.id));
        }
        await enqueue(
          "bookingProcess",
          {
            bookingId: result.booking.id,
            event,
            previousBookingId: result.previous?.id,
            sealedToken: cipher.encrypt(result.token),
            // Seated events: only this seat (and the host) is emailed, even for the first seat.
            ...(result.seat && { seatAttendeeId: result.seat.id, seatJoined: Boolean(result.joined) }),
            ...(result.series && { seriesId: result.booking.recurringSeriesId! }),
          },
          { db: fromDrizzle(tx, sql) },
        );
      },
    });
    const b = created.booking;
    const et = target.eventType;
    const external =
      et.redirectUrl && !created.previous
        ? bookingRedirectUrl(et.redirectUrl, et.redirectForwardParams, {
            uid: b.uid,
            title: b.title,
            start: b.startAt.getTime(),
            end: b.endAt.getTime(),
            status: b.status,
            eventSlug: et.slug,
            name: input.booker.name,
            email: input.booker.email,
          })
        : null;
    if (external) return { ok: true, data: { redirect: external, external: true, uid: b.uid, status: b.status } };
    return {
      ok: true,
      data: { redirect: `/booking/${b.uid}?token=${encodeURIComponent(created.token)}&new=1${input.embed ? "&embed=1" : ""}`, uid: b.uid, status: b.status },
    };
  } catch (error) {
    if (error instanceof BookingFailure) return { ok: false, message: FAILURE_MESSAGES[error.code] ?? "Booking failed." };
    throw error;
  }
}

export async function cancelBookingAction(raw: unknown): Promise<PublicResult> {
  if (await overLimit("cancel", clientIp(await headers()))) return TOO_MANY;
  const parsed = cancelBookingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { scope, ...input } = parsed.data;
  const onCommit = (tx: Tx, cancelled: { id: string }) =>
    enqueue("bookingProcess", { bookingId: cancelled.id, event: "cancelled" }, { db: fromDrizzle(tx, sql) }).then(() => undefined);
  try {
    const db = getDb();
    // A seat token cancels only that seat (EVT-012).
    const [row] = await db.select({ id: booking.id }).from(booking).where(eq(booking.uid, input.uid));
    const seat = row ? await findSeat(db, row.id, input.token) : null;
    if (seat && row) {
      const details = await findBookingById(db, row.id);
      await cancelSeat(db, {
        uid: input.uid,
        token: input.token,
        now: Date.now(),
        onCommit: async (tx, b, cancelledSeat, last) => {
          // The last seat cancels the booking (full cleanup through the job). Otherwise only this
          // seat and the host are told; the seat row is gone by then, so emails are built here.
          if (last || !details) {
            await enqueue("bookingProcess", { bookingId: b.id, event: "cancelled" }, { db: fromDrizzle(tx, sql) });
            return;
          }
          const cipher = cipherFromEnv(getEnv());
          const emails = buildBookingEmails({ kind: "cancelled", details: { ...details, booking: b }, seat: cancelledSeat }, getEnv().APP_URL, Date.now());
          for (const email of emails) await enqueue("emailSend", sealEmail(cipher, email), { db: fromDrizzle(tx, sql) });
        },
      });
      return { ok: true };
    }
    if (scope === "series") await cancelSeriesByAttendee(db, { ...input, now: Date.now(), onCommit });
    else await cancelByAttendee(db, { ...input, now: Date.now(), onCommit });
    return { ok: true };
  } catch (error) {
    if (error instanceof BookingFailure) return { ok: false, message: FAILURE_MESSAGES[error.code] ?? "Cancellation failed." };
    throw error;
  }
}
