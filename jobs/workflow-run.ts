import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { workflow } from "@/db/schema";
import { answerList, manageUrl } from "@/features/bookings/server/notifications";
import { type BookingDetails, findBookingById } from "@/features/bookings/server/service";
import { renderSubject, renderTemplate, type TemplateContext } from "@/features/workflows/render";
import { prefers12Hour } from "@/lib/format";
import { stableJobId } from "@/lib/jobs/job-id";
import { type EmailRequest, workflowRunPayload } from "@/lib/jobs/queues";
import { bookingPagePath } from "@/features/bookings/server/booking-path";
import type { Cipher } from "@/lib/crypto/encryption";
import { errorSummary, logger } from "@/lib/logger";

export type WorkflowRunDeps = {
  db: Database;
  appUrl: string;
  /** Opens the booker's sealed manage token for their cancel/reschedule links (NTF-005). */
  cipher?: Cipher;
  enqueueEmail(email: EmailRequest, jobId: string): Promise<void>;
};

type Links = { booker: Partial<TemplateContext>; host: Partial<TemplateContext> };

/**
 * Per-audience links (NTF-005): the booker gets working cancel/reschedule links (their manage
 * token, sealed on the booking); hosts get the dashboard; guests only the read-only page.
 */
async function linksFor(deps: WorkflowRunDeps, details: BookingDetails): Promise<Links> {
  const b = details.booking;
  const dashboard = `${deps.appUrl}/bookings`;
  const host = { bookingUrl: dashboard, cancelUrl: dashboard, rescheduleUrl: dashboard };
  let token: string | null = null;
  try {
    token = b.manageTokenSealed && deps.cipher ? deps.cipher.decrypt(b.manageTokenSealed, b.id) : null;
  } catch (error) {
    logger.warn("workflow.token_unreadable", { bookingId: b.id, ...errorSummary(error) });
  }
  if (!token) return { booker: {}, host };
  const manage = manageUrl(deps.appUrl, b.uid, token);
  const policy = details.eventType;
  const path = policy.disableRescheduling || b.recurringSeriesId ? null : await bookingPagePath(deps.db, b.eventTypeId, b.organizerId);
  return {
    booker: {
      bookingUrl: manage,
      cancelUrl: policy.disableCancelling ? "" : manage,
      rescheduleUrl: path ? `${deps.appUrl}${path}?reschedule=${encodeURIComponent(b.uid)}&token=${encodeURIComponent(token)}` : "",
    },
    host,
  };
}

type Recipient = { to: string; locale: string; timeZone: string; hour12: boolean; ctx: Partial<TemplateContext> };

/**
 * Recipients with their own view of the booking: attendees see their own name and answers only
 * (seats never learn about each other, guests never see the booker's answers, EVT-012).
 */
function recipientsFor(row: typeof workflow.$inferSelect, details: BookingDetails, links: Links): Recipient[] {
  const seated = details.eventType.seatsPerSlot !== null;
  const host = { locale: details.host.locale, timeZone: details.host.timeZone, hour12: details.host.timeFormat === 12 };
  const people = details.attendees.filter((a) => !a.isGuest);
  const hostCtx: Partial<TemplateContext> = {
    ...links.host,
    ...(seated && { attendeeName: people.map((a) => a.name).join(", "), attendeeEmail: "", answers: [] }),
  };
  if (row.recipient === "host") {
    // Every host of a collective booking, each in their own settings (TEAM-004).
    const hosts = details.hosts?.length ? details.hosts : [details.host];
    return hosts.map((h) => ({ to: h.email, locale: h.locale, timeZone: h.timeZone, hour12: h.timeFormat === 12, ctx: hostCtx }));
  }
  // A fixed address is outside the booking: no tokenized links, no dashboard.
  if (row.recipient === "address" && row.address) return [{ to: row.address, ...host, ctx: { ...hostCtx, bookingUrl: "", cancelUrl: "", rescheduleUrl: "" } }];
  return details.attendees.map((a) => ({
    to: a.email,
    locale: a.locale,
    timeZone: a.timeZone,
    hour12: prefers12Hour(a.locale),
    ctx: {
      // Only the booker holds the manage token; seats have their own tokens (not sealed).
      ...(!a.isGuest && !seated ? links.booker : {}),
      attendeeName: a.isGuest ? a.email : a.name,
      attendeeEmail: a.email,
      answers: a.isGuest ? [] : seated ? answerList(details, a.responses) : answerList(details),
    },
  }));
}

/**
 * Runs one workflow step for one booking (NTF-005). Stale steps are dropped: the workflow was
 * disabled or deleted, the booking was cancelled (for non-cancellation triggers) or moved (its
 * start no longer matches), so reschedules and cancellations need no job bookkeeping.
 */
export function createWorkflowRunHandler(deps: WorkflowRunDeps) {
  return async (jobs: { id: string; data: unknown }[]): Promise<void> => {
    for (const job of jobs) {
      const payload = workflowRunPayload.parse(job.data);
      const [row] = await deps.db.select().from(workflow).where(eq(workflow.id, payload.workflowId));
      const details = await findBookingById(deps.db, payload.bookingId);
      const wantsCancelled = row?.trigger === "booking_cancelled";
      const stale =
        !row ||
        !row.enabled ||
        !details ||
        details.booking.startAt.getTime() !== payload.expectedStart ||
        (wantsCancelled ? details.booking.status !== "cancelled" : details.booking.status !== "accepted");
      if (stale) {
        logger.info("workflow.skipped_stale", { jobId: job.id });
        continue;
      }
      const booker = details.attendees.find((a) => !a.isGuest) ?? details.attendees[0];
      const ctx: TemplateContext = {
        eventName: details.booking.title,
        hostName: details.host.name,
        attendeeName: booker?.name ?? "",
        attendeeEmail: booker?.email ?? "",
        start: details.booking.startAt.getTime(),
        end: details.booking.endAt.getTime(),
        location: details.booking.locationValue,
        bookingUrl: manageUrl(deps.appUrl, details.booking.uid),
        cancelUrl: "",
        rescheduleUrl: "",
        answers: answerList(details),
      };
      const links = await linksFor(deps, details);
      for (const r of recipientsFor(row, details, links)) {
        const prefs = { locale: r.locale, timeZone: r.timeZone, hour12: r.hour12 };
        const mine = { ...ctx, ...r.ctx };
        const email: EmailRequest = {
          to: r.to,
          template: "workflow",
          props: { subject: renderSubject(row.subject, mine, prefs), body: renderTemplate(row.body, mine, prefs), bookingUrl: mine.bookingUrl || manageUrl(deps.appUrl, details.booking.uid) },
        };
        await deps.enqueueEmail(email, stableJobId(`workflow-email:${job.id}:${r.to}`));
      }
      logger.info("workflow.sent", { jobId: job.id, trigger: row.trigger });
    }
  };
}
