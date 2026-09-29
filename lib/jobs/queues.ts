import { z } from "zod";
import type { Cipher } from "@/lib/crypto/encryption";

/**
 * Queue catalogue (ADR-0005). Every queue has a typed, validated payload and explicit retry
 * policy. Handlers live in /jobs and must be idempotent (pg-boss is at-least-once).
 */

const url = z.string().url().max(2048);
const name = z.string().max(200);

const calendarPart = z.object({ method: z.enum(["REQUEST", "CANCEL", "PUBLISH"]), content: z.string().max(200_000) });
const answers = z.array(z.object({ label: z.string().max(200), value: z.string().max(2000) })).max(30);
const occurrences = z.array(z.object({ start: z.number().int(), end: z.number().int() })).max(52);

/** Everything needed to describe a booking in an email, in the recipient's own settings. */
const bookingView = z.object({
  audience: z.enum(["attendee", "host"]),
  title: z.string().max(500),
  start: z.number().int(),
  end: z.number().int(),
  timeZone: z.string().max(64),
  locale: z.string().max(35),
  hour12: z.boolean(),
  hostName: name,
  attendeeName: name,
  attendeeEmail: z.string().email(),
  location: z.string().max(500).optional(),
  ics: calendarPart,
});

/** What an email needs to render. Contains one-time tokens, so it is never stored in clear. */
export const emailContent = z.discriminatedUnion("template", [
  z.object({ template: z.literal("verify-email"), props: z.object({ name, url }) }),
  z.object({ template: z.literal("reset-password"), props: z.object({ name, url }) }),
  z.object({ template: z.literal("magic-link"), props: z.object({ url }) }),
  /** TEAM-002: the link only opens the dashboard; accepting needs the invited, verified email. */
  z.object({ template: z.literal("team-invitation"), props: z.object({ teamName: name, inviterName: name, role: z.enum(["owner", "admin", "member"]), url }) }),
  z.object({
    template: z.literal("booking-scheduled"),
    props: bookingView.extend({
      rescheduled: z.boolean(),
      /** The host accepted a pending booking (BKG-012). */
      accepted: z.boolean().optional(),
      /** The booking moved to another team member (TEAM-002). */
      reassigned: z.boolean().optional(),
      notes: z.string().max(5000).optional(),
      /** Attendee: tokenized manage link. Host: dashboard link. */
      manageUrl: url,
      /** Recurring series: every occurrence (EVT-013). */
      occurrences: occurrences.optional(),
      /** Answers to booking questions, for the host (EVT-009). */
      answers: answers.optional(),
    }),
  }),
  z.object({
    /** A booking waits for the host's confirmation (NTF-004). */
    template: z.literal("booking-requested"),
    props: bookingView.omit({ ics: true }).extend({
      manageUrl: url,
      /** Host only: signed one-click links to the decision page (BKG-012). */
      acceptUrl: url.optional(),
      rejectUrl: url.optional(),
      notes: z.string().max(5000).optional(),
      answers: answers.optional(),
      occurrences: occurrences.optional(),
    }),
  }),
  z.object({
    template: z.literal("booking-rejected"),
    props: bookingView.omit({ ics: true }).extend({ reason: z.string().max(1000).optional(), rebookUrl: url.optional() }),
  }),
  z.object({
    /** Email workflow step (NTF-005): already rendered plain text. */
    template: z.literal("workflow"),
    props: z.object({ subject: z.string().max(200), body: z.string().max(20_000), bookingUrl: url }),
  }),
  z.object({
    template: z.literal("integration-error"),
    props: z.object({ name, provider: z.string().max(100), account: z.string().max(300), url }),
  }),
  z.object({
    template: z.literal("booking-cancelled"),
    props: bookingView.extend({
      /** Omitted for the host when only one seat left a seated booking. */
      ics: calendarPart.optional(),
      cancelledBy: z.enum(["attendee", "host", "system"]),
      reason: z.string().max(1000).optional(),
      /** Set when the host asks the attendee to pick a new time. */
      rebookUrl: url.optional(),
    }),
  }),
]);

export type EmailContent = z.infer<typeof emailContent>;
export type EmailRequest = EmailContent & { to: string };

/**
 * Stored job payload: the recipient in clear (for debugging and dead-letter triage) and the
 * template props sealed with AES-256-GCM, so sign-in/reset links in pgboss.job are useless to
 * anyone reading the database or a backup (NFR-007).
 */
export const emailJobPayload = z.object({
  to: z.string().email(),
  // Derived from the content schema so a new template can't be forgotten here.
  template: z.enum(emailContent.options.map((o) => o.shape.template.value) as [EmailContent["template"], ...EmailContent["template"][]]),
  sealed: z.string().min(1),
});

export type EmailJobPayload = z.infer<typeof emailJobPayload>;

export function sealEmail(cipher: Cipher, request: EmailRequest): EmailJobPayload {
  const { to, ...content } = request;
  const parsed = emailContent.parse(content);
  return emailJobPayload.parse({ to, template: parsed.template, sealed: cipher.encrypt(JSON.stringify(parsed.props)) });
}

export function openEmail(cipher: Cipher, payload: EmailJobPayload): EmailRequest {
  const props: unknown = JSON.parse(cipher.decrypt(payload.sealed));
  return { to: payload.to, ...emailContent.parse({ template: payload.template, props }) };
}

/**
 * Side effects of a booking change (calendar sync, meetings, then emails). Enqueued inside the
 * booking transaction so a committed booking always gets its side effects (outbox semantics).
 * The manage token (created bookings only) is sealed, never stored in clear.
 */
/** `reassigned`: a team booking got a new host when a member left the team (TEAM-002). */
export const BOOKING_EVENTS = ["created", "rescheduled", "cancelled", "requested", "accepted", "rejected", "reassigned"] as const;
export type BookingEvent = (typeof BOOKING_EVENTS)[number];

export const bookingProcessPayload = z.object({
  bookingId: z.string().min(1).max(64),
  event: z.enum(BOOKING_EVENTS),
  previousBookingId: z.string().max(64).optional(),
  sealedToken: z.string().max(500).optional(),
  rebookUrl: url.optional(),
  /** Seated events (EVT-012): the seat that was added or cancelled; others aren't emailed. */
  seatAttendeeId: z.string().max(64).optional(),
  /** The seat joined an existing booking: nothing to sync and no new workflows/webhooks. */
  seatJoined: z.boolean().optional(),
  /** Recurring series (EVT-013): `bookingId` is the first occurrence. */
  seriesId: z.string().max(64).optional(),
});
export type BookingProcessPayload = z.infer<typeof bookingProcessPayload>;

/** Webhook delivery (API-003): the payload lives in `webhook_delivery`, the job only points to it. */
export const webhookDeliverPayload = z.object({ deliveryId: z.string().min(1).max(64) });

/**
 * One workflow step for one booking (NTF-005). Timed steps are delayed jobs; when they fire they
 * re-check that the booking is still active and still starts at `expectedStart`, so reschedules
 * and cancellations need no cleanup.
 */
export const workflowRunPayload = z.object({
  workflowId: z.string().min(1).max(64),
  bookingId: z.string().min(1).max(64),
  expectedStart: z.number().int(),
});

/** Fires at a booking's end: MEETING_ENDED webhooks (API-001). */
export const bookingEndedPayload = z.object({ bookingId: z.string().min(1).max(64), expectedEnd: z.number().int() });

export const QUEUES = {
  emailSend: {
    name: "email.send",
    deadLetter: "email.send.dead",
    schema: emailJobPayload,
    // ~1s, 2s, 4s … capped at 10 min. Finished jobs are deleted after an hour.
    options: { notify: true, retryLimit: 8, retryDelay: 1, retryBackoff: true, retryDelayMax: 600, deleteAfterSeconds: 3600 },
  },
  bookingProcess: {
    name: "booking.process",
    deadLetter: "booking.process.dead",
    schema: bookingProcessPayload,
    // Calendar APIs can be briefly unavailable; the handler itself never double-sends emails.
    options: { notify: true, retryLimit: 5, retryDelay: 5, retryBackoff: true, retryDelayMax: 600, deleteAfterSeconds: 24 * 3600 },
  },
  webhookDeliver: {
    name: "webhook.deliver",
    deadLetter: "webhook.deliver.dead",
    schema: webhookDeliverPayload,
    // 11 attempts: 1 min, 2, 4 … capped at 6 h — spans ≈ 24 h (API-003).
    options: { notify: true, retryLimit: 10, retryDelay: 60, retryBackoff: true, retryDelayMax: 6 * 3600, deleteAfterSeconds: 7 * 24 * 3600 },
  },
  workflowRun: {
    name: "workflow.run",
    deadLetter: "workflow.run.dead",
    schema: workflowRunPayload,
    options: { notify: true, retryLimit: 5, retryDelay: 30, retryBackoff: true, retryDelayMax: 1800, deleteAfterSeconds: 7 * 24 * 3600 },
  },
  bookingEnded: {
    name: "booking.ended",
    deadLetter: "booking.ended.dead",
    schema: bookingEndedPayload,
    options: { retryLimit: 5, retryDelay: 30, retryBackoff: true, deleteAfterSeconds: 7 * 24 * 3600 },
  },
  maintenance: {
    name: "maintenance.prune-auth",
    deadLetter: "maintenance.prune-auth.dead",
    schema: z.object({}).passthrough(),
    options: { retryLimit: 2, retryDelay: 60, deleteAfterSeconds: 3600 },
  },
} as const;

/** Cron schedules registered by the worker role. */
export const SCHEDULES = [{ queue: QUEUES.maintenance.name, cron: "*/15 * * * *" }] as const;

export type QueueKey = keyof typeof QUEUES;
export type QueuePayload<K extends QueueKey> = z.infer<(typeof QUEUES)[K]["schema"]>;
