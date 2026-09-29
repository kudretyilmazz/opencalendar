import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { booking } from "@/db/schema";
import { type BookingEmailEvent, buildBookingEmails } from "@/features/bookings/server/notifications";
import { type BookingDetails, type BookingRow, findBookingById } from "@/features/bookings/server/service";
import type { IntegrationDeps } from "@/features/calendars/server/credentials";
import { type SyncOutcome, syncCancelled, syncCreated, syncRescheduled } from "@/features/calendars/server/sync";
import type { Cipher } from "@/lib/crypto/encryption";
import { stableJobId } from "@/lib/jobs/job-id";
import { type BookingProcessPayload, bookingProcessPayload, type EmailRequest } from "@/lib/jobs/queues";
import { errorSummary, logger } from "@/lib/logger";
import { decisionUrls, type EnqueueJob, scheduleEffects } from "./booking-effects";

export type BookingProcessDeps = {
  db: Database;
  cipher: Cipher;
  appUrl: string;
  /** Signs the one-click accept/reject links (BKG-012). */
  authSecret: string;
  integrations: IntegrationDeps;
  /** `jobId` is deterministic per booking event and recipient, so a retried job never sends twice. */
  enqueueEmail(email: EmailRequest, jobId: string): Promise<void>;
  enqueueJob: EnqueueJob;
  now?: () => number;
};

/** The pg-boss job fields this handler reads (`includeMetadata: true` supplies the retry counts). */
export type BookingProcessJob = { id: string; data: unknown; retryCount?: number; retryLimit?: number };

const INACTIVE = new Set(["cancelled", "rejected"]);
/** Events after which the booking should exist in external calendars. */
const SYNCS_CREATE = new Set(["created", "accepted"]);

export { stableJobId };

export class RetrySyncError extends Error {
  constructor(failures: number) {
    super(`Calendar sync failed transiently (${failures}); retrying`);
    this.name = "RetrySyncError";
  }
}

async function seriesRows(db: Database, payload: BookingProcessPayload, first: BookingRow): Promise<BookingRow[]> {
  if (!payload.seriesId) return [first];
  return db.select().from(booking).where(eq(booking.recurringSeriesId, payload.seriesId)).orderBy(asc(booking.startAt));
}

async function syncOne(deps: BookingProcessDeps, payload: BookingProcessPayload, details: BookingDetails): Promise<SyncOutcome> {
  if (SYNCS_CREATE.has(payload.event)) return syncCreated(deps.integrations, details);
  if (payload.event === "rescheduled") return syncRescheduled(deps.integrations, details, payload.previousBookingId!);
  if (payload.event === "cancelled") return syncCancelled(deps.integrations, details.booking.id);
  if (payload.event === "reassigned") {
    // The event moves from the old organizer's calendar to the new one's (TEAM-002).
    const removed = await syncCancelled(deps.integrations, details.booking.id);
    if (removed.failures.length) return removed;
    return syncCreated(deps.integrations, details);
  }
  return { failures: [], retryable: false }; // requested / rejected: nothing in external calendars
}

/** Calendar/meeting sync per affected booking. Seat joins need none (the event exists). */
async function sync(deps: BookingProcessDeps, payload: BookingProcessPayload, rows: BookingDetails[]): Promise<SyncOutcome> {
  if (payload.seatJoined) return { failures: [], retryable: false };
  const failures: string[] = [];
  let retryable = false;
  for (const details of rows) {
    try {
      const one = await syncOne(deps, payload, details);
      failures.push(...one.failures);
      retryable ||= one.retryable;
    } catch (error) {
      logger.error("booking.sync_crashed", { bookingId: details.booking.id, ...errorSummary(error) });
      failures.push("crashed");
      retryable = true;
    }
  }
  return { failures, retryable };
}

function emailEvent(deps: BookingProcessDeps, payload: BookingProcessPayload, details: BookingDetails, series: BookingRow[] | undefined, now: number): BookingEmailEvent {
  const token = payload.sealedToken ? deps.cipher.decrypt(payload.sealedToken) : "";
  const seat = payload.seatAttendeeId ? details.attendees.find((a) => a.id === payload.seatAttendeeId) : undefined;
  switch (payload.event) {
    case "requested":
      return { kind: "requested", details, token, decision: decisionUrls(deps.appUrl, deps.authSecret, details.booking, now), series };
    case "rejected":
      return { kind: "rejected", details, rebookUrl: payload.rebookUrl };
    case "cancelled":
      return { kind: "cancelled", details, rebookUrl: payload.rebookUrl, seat };
    default:
      return {
        kind: "scheduled",
        details,
        token,
        rescheduled: payload.event === "rescheduled",
        accepted: payload.event === "accepted",
        reassigned: payload.event === "reassigned",
        seat,
        series,
      };
  }
}

/**
 * Consumer for `booking.process`: mirrors the change to external calendars/meetings first (so
 * generated Meet/Teams/Zoom links are in the emails), then queues the emails, workflow steps,
 * webhooks and the end-of-meeting job.
 *
 * - A booking that should be active but no longer is gets nothing; if it was cancelled while
 *   the sync ran, whatever the sync created is removed again (no resurrected events).
 * - Transient provider failures throw so pg-boss retries (every step is idempotent); on the last
 *   attempt everything else goes out anyway and the failure stays visible (INT-012).
 */
export function createBookingProcessHandler(deps: BookingProcessDeps) {
  const now = deps.now ?? Date.now;
  return async (jobs: BookingProcessJob[]): Promise<void> => {
    for (const job of jobs) {
      const payload: BookingProcessPayload = bookingProcessPayload.parse(job.data);
      const first = await findBookingById(deps.db, payload.bookingId);
      if (!first) {
        logger.warn("booking.process_missing", { jobId: job.id });
        continue;
      }
      const wantsActive = payload.event !== "cancelled" && payload.event !== "rejected";
      if (wantsActive && INACTIVE.has(first.booking.status)) {
        logger.info("booking.process_skipped_inactive", { jobId: job.id, bookingEvent: payload.event });
        continue;
      }
      const rows = await seriesRows(deps.db, payload, first.booking);
      const loaded = await Promise.all(rows.map((r) => (r.id === first.booking.id ? first : findBookingById(deps.db, r.id))));
      const all = loaded.filter((d): d is BookingDetails => d !== null && (!wantsActive || !INACTIVE.has(d.booking.status)));
      const outcome = await sync(deps, payload, all);
      const details = (await findBookingById(deps.db, payload.bookingId)) ?? first; // sync may set the meeting link

      // Cancelled meanwhile: undo what the sync made. A booking that was *rescheduled* meanwhile
      // keeps them: its successor's job adopts and moves those references.
      if (wantsActive && INACTIVE.has(details.booking.status)) {
        if (!details.booking.rescheduled) {
          await syncCancelled(deps.integrations, details.booking.id).catch((error) =>
            logger.error("booking.sweep_failed", { bookingId: details.booking.id, ...errorSummary(error) }),
          );
        }
        logger.info("booking.process_cancelled_meanwhile", { jobId: job.id });
        continue;
      }
      const lastAttempt = (job.retryCount ?? 0) >= (job.retryLimit ?? 0);
      if (outcome.retryable && !lastAttempt) throw new RetrySyncError(outcome.failures.length);

      const series = payload.seriesId ? all.map((d) => d.booking) : undefined;
      await sendEmails(deps, payload, emailEvent(deps, payload, details, series, now()), lastAttempt);
      // Seat joins don't restart the booking's workflows or webhooks (EVT-012).
      if (!payload.seatJoined) {
        await scheduleEffects({ db: deps.db, enqueueJob: deps.enqueueJob, now }, payload.event, all.map((d) => d.booking));
      }
      logger.info("booking.processed", { jobId: job.id, bookingEvent: payload.event, syncFailures: outcome.failures.length });
    }
  };
}

/**
 * Enqueues one email per participant. Job ids are deterministic, so when an enqueue fails the
 * whole job is retried and already-queued emails are not sent twice; only the last attempt
 * gives up (logged) rather than failing the job forever.
 */
async function sendEmails(deps: BookingProcessDeps, payload: BookingProcessPayload, event: BookingEmailEvent, lastAttempt: boolean) {
  const emails = buildBookingEmails(event, deps.appUrl, (deps.now ?? Date.now)());
  // A booking can be reassigned more than once (TEAM-002): each change has its own sequence.
  const scope = payload.seatAttendeeId
    ? `${payload.event}:${payload.seatAttendeeId}`
    : payload.event === "reassigned"
      ? `${payload.event}:${event.details.booking.sequence}`
      : payload.event;
  for (const [i, email] of emails.entries()) {
    try {
      // The index keeps ids apart when two recipients share an address (e.g. host books themself).
      await deps.enqueueEmail(email, stableJobId(`${payload.bookingId}:${scope}:${email.template}:${email.to}:${i}`));
    } catch (error) {
      logger.error("booking.email_enqueue_failed", { bookingId: payload.bookingId, template: email.template, lastAttempt, ...errorSummary(error) });
      if (!lastAttempt) throw error;
    }
  }
}
