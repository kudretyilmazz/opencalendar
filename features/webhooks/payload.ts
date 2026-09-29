import { z } from "zod";
import type { BookingDetails } from "@/features/bookings/server/service";

/**
 * Webhook payload schema, version 1 (API-005). Documented in
 * docs/03-architecture/api-and-webhooks.md; any breaking change needs a new `version`.
 * Manage tokens and their hashes are never part of a payload.
 */

export const WEBHOOK_PAYLOAD_VERSION = 1;

export const WEBHOOK_TRIGGERS = [
  "BOOKING_CREATED",
  "BOOKING_REQUESTED",
  "BOOKING_CANCELLED",
  "BOOKING_RESCHEDULED",
  "BOOKING_REJECTED",
  "BOOKING_NO_SHOW_UPDATED",
  "MEETING_ENDED",
  /** Reserved (payments, M5). */
  "BOOKING_PAID",
  /** Routing form response stored (RTE-005, API-001). */
  "FORM_SUBMITTED",
  /** Manual test delivery; never stored on a subscription. */
  "PING",
] as const;

export type WebhookTrigger = (typeof WEBHOOK_TRIGGERS)[number];

/** Triggers a subscription can choose (API-001). BOOKING_PAID stays reserved until payments ship (M5). */
export const SUBSCRIBABLE_TRIGGERS = [
  "BOOKING_CREATED",
  "BOOKING_REQUESTED",
  "BOOKING_CANCELLED",
  "BOOKING_RESCHEDULED",
  "BOOKING_REJECTED",
  "BOOKING_NO_SHOW_UPDATED",
  "MEETING_ENDED",
  "FORM_SUBMITTED",
] as const satisfies readonly WebhookTrigger[];

export type SubscribableTrigger = (typeof SUBSCRIBABLE_TRIGGERS)[number];

export const TRIGGER_LABELS: Record<SubscribableTrigger, string> = {
  BOOKING_CREATED: "Booking created",
  BOOKING_REQUESTED: "Booking requested (needs confirmation)",
  BOOKING_CANCELLED: "Booking cancelled",
  BOOKING_RESCHEDULED: "Booking rescheduled",
  BOOKING_REJECTED: "Booking rejected",
  BOOKING_NO_SHOW_UPDATED: "No-show updated",
  MEETING_ENDED: "Meeting ended",
  FORM_SUBMITTED: "Routing form submitted",
};

const responseValue = z.union([z.string(), z.array(z.string()), z.boolean(), z.number()]);

export const webhookBookingSchema = z.object({
  uid: z.string(),
  title: z.string(),
  status: z.enum(["accepted", "pending", "awaiting_payment", "cancelled", "rejected"]),
  start: z.string().datetime(),
  end: z.string().datetime(),
  timeZone: z.string(),
  location: z.object({ kind: z.string(), value: z.string().nullable() }).nullable(),
  responses: z.record(z.string(), responseValue),
  utm: z.record(z.string(), z.string()).nullable(),
  noShow: z.object({ host: z.boolean() }),
  eventType: z.object({ id: z.string(), slug: z.string(), title: z.string() }),
  organizer: z.object({ name: z.string(), email: z.string(), timeZone: z.string(), username: z.string() }),
  attendees: z.array(
    z.object({
      name: z.string(),
      email: z.string(),
      timeZone: z.string(),
      locale: z.string(),
      noShow: z.boolean(),
      isGuest: z.boolean(),
    }),
  ),
  rescheduledFromUid: z.string().optional(),
  cancellation: z.object({ by: z.enum(["attendee", "host", "system"]).nullable(), reason: z.string().nullable() }).optional(),
  rejectionReason: z.string().optional(),
});

export type WebhookBooking = z.infer<typeof webhookBookingSchema>;

export const bookingPayloadSchema = z.object({ booking: webhookBookingSchema });
const formActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event_type"), eventTypeId: z.string() }),
  z.object({ kind: z.literal("external_url"), url: z.string() }),
  z.object({ kind: z.literal("message"), message: z.string() }),
]);

/** FORM_SUBMITTED (API-001, RTE-005): what was answered and where the visitor was routed. */
export const formSubmittedPayloadSchema = z.object({
  form: z.object({ id: z.string(), name: z.string() }),
  response: z.object({
    id: z.string(),
    answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number()])),
    matchedRuleId: z.string().nullable(),
    action: formActionSchema,
    submittedAt: z.string().datetime(),
  }),
});

export const pingPayloadSchema = z.object({ ping: z.literal(true), webhookId: z.string() });

export const webhookEnvelopeSchema = z.object({
  version: z.literal(WEBHOOK_PAYLOAD_VERSION),
  id: z.string(),
  trigger: z.enum(WEBHOOK_TRIGGERS),
  createdAt: z.string().datetime(),
  payload: z.union([bookingPayloadSchema, formSubmittedPayloadSchema, pingPayloadSchema]),
});

export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;
export type BookingPayload = z.infer<typeof bookingPayloadSchema>;
export type FormSubmittedPayload = z.infer<typeof formSubmittedPayloadSchema>;
export type PingPayload = z.infer<typeof pingPayloadSchema>;

/** Extra facts not in `BookingDetails` (looked up by the emitter). */
export type BookingPayloadExtras = { rescheduledFromUid?: string };

/** Builds the `payload` object for a booking trigger. Pure: no I/O, no secrets. */
export function buildBookingPayload(details: BookingDetails, extras: BookingPayloadExtras = {}): BookingPayload {
  const { booking: b, attendees, eventType, host } = details;
  const booking: WebhookBooking = {
    uid: b.uid,
    title: b.title,
    status: b.status,
    start: b.startAt.toISOString(),
    end: b.endAt.toISOString(),
    timeZone: b.timeZone,
    location: b.locationKind ? { kind: b.locationKind, value: b.locationValue ?? null } : null,
    responses: { ...(b.responses ?? {}) },
    utm: b.utm ? { ...b.utm } : null,
    noShow: { host: b.hostNoShow },
    eventType: { id: eventType.id, slug: eventType.slug, title: eventType.title },
    organizer: { name: host.name, email: host.email, timeZone: host.timeZone, username: host.username },
    attendees: attendees.map((a) => ({
      name: a.name,
      email: a.email,
      timeZone: a.timeZone,
      locale: a.locale,
      noShow: a.noShow,
      isGuest: a.isGuest,
    })),
    ...(extras.rescheduledFromUid ? { rescheduledFromUid: extras.rescheduledFromUid } : {}),
    ...(b.status === "cancelled" ? { cancellation: { by: b.cancelledBy ?? null, reason: b.cancellationReason ?? null } } : {}),
    ...(b.status === "rejected" && b.rejectionReason ? { rejectionReason: b.rejectionReason } : {}),
  };
  return bookingPayloadSchema.parse({ booking });
}

export function buildEnvelope(input: { id: string; trigger: WebhookTrigger; createdAt: Date; payload: BookingPayload | FormSubmittedPayload | PingPayload }): WebhookEnvelope {
  return webhookEnvelopeSchema.parse({
    version: WEBHOOK_PAYLOAD_VERSION,
    id: input.id,
    trigger: input.trigger,
    createdAt: input.createdAt.toISOString(),
    payload: input.payload,
  });
}
