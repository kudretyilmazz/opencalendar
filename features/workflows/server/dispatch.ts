import type { BookingEvent } from "@/lib/jobs/queues";
import { stableJobId } from "@/lib/jobs/job-id";
import type { WorkflowRow } from "./service";

/**
 * Which workflow steps a booking change starts (NTF-005/006). Immediate steps run now; timed
 * steps are delayed jobs. Job ids are deterministic, so a retried booking job never schedules a
 * step twice, and a moved booking gets new ids (its new start is part of the key).
 */

export type WorkflowJob = { id: string; payload: { workflowId: string; bookingId: string; expectedStart: number }; startAfter?: Date };

const IMMEDIATE: Partial<Record<BookingEvent, WorkflowRow["trigger"]>> = {
  created: "booking_created",
  accepted: "booking_created",
  rescheduled: "booking_rescheduled",
  cancelled: "booking_cancelled",
};

/** Events after which the booking is confirmed and timed reminders apply. */
const CONFIRMED: ReadonlySet<BookingEvent> = new Set(["created", "accepted", "rescheduled"]);

export function workflowJobsFor(
  workflows: readonly WorkflowRow[],
  event: BookingEvent,
  booking: { id: string; startAt: Date; endAt: Date },
  now: number,
): WorkflowJob[] {
  const start = booking.startAt.getTime();
  const end = booking.endAt.getTime();
  const job = (w: WorkflowRow, at?: number): WorkflowJob => ({
    id: stableJobId(`workflow:${w.id}:${booking.id}:${w.trigger}:${start}`),
    payload: { workflowId: w.id, bookingId: booking.id, expectedStart: start },
    ...(at !== undefined && { startAfter: new Date(at) }),
  });
  const out: WorkflowJob[] = [];
  for (const w of workflows) {
    if (!w.enabled) continue;
    if (w.trigger === IMMEDIATE[event]) out.push(job(w));
    if (!CONFIRMED.has(event)) continue;
    // A reminder whose time has already passed is skipped rather than sent late.
    if (w.trigger === "before_start" && start - w.offsetMinutes * 60_000 > now) out.push(job(w, start - w.offsetMinutes * 60_000));
    if (w.trigger === "after_end") out.push(job(w, end + w.offsetMinutes * 60_000));
  }
  return out;
}
