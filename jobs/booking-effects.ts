import type { Database } from "@/db/client";
import type { BookingRow } from "@/features/bookings/server/service";
import { workflowJobsFor } from "@/features/workflows/server/dispatch";
import { activeWorkflows } from "@/features/workflows/server/service";
import { emitWebhooks } from "@/features/webhooks/server/emit";
import type { WebhookTrigger } from "@/features/webhooks/payload";
import { stableJobId } from "@/lib/jobs/job-id";
import type { BookingEvent, QueueKey, QueuePayload } from "@/lib/jobs/queues";
import { signAction } from "@/lib/security/signed-links";

/**
 * Side effects of a booking change besides calendar sync and emails (M3): workflow steps
 * (NTF-005), webhooks (API-001) and the end-of-meeting job. Every enqueue uses a deterministic
 * id, so a retried `booking.process` job never duplicates them.
 */

export type EnqueueJob = <K extends QueueKey>(key: K, payload: QueuePayload<K>, options: { id: string; startAfter?: Date }) => Promise<void>;

export type EffectsDeps = { db: Database; enqueueJob: EnqueueJob; now: () => number };

const WEBHOOK_FOR: Partial<Record<BookingEvent, WebhookTrigger>> = {
  created: "BOOKING_CREATED",
  accepted: "BOOKING_CREATED",
  requested: "BOOKING_REQUESTED",
  rescheduled: "BOOKING_RESCHEDULED",
  cancelled: "BOOKING_CANCELLED",
  rejected: "BOOKING_REJECTED",
};

const CONFIRMED: ReadonlySet<BookingEvent> = new Set(["created", "accepted", "rescheduled"]);

export async function scheduleEffects(deps: EffectsDeps, event: BookingEvent, rows: readonly BookingRow[]): Promise<void> {
  const workflows = rows.length ? await activeWorkflows(deps.db, rows[0].eventTypeId) : [];
  for (const row of rows) {
    for (const job of workflowJobsFor(workflows, event, row, deps.now())) {
      await deps.enqueueJob("workflowRun", job.payload, { id: job.id, ...(job.startAfter && { startAfter: job.startAfter }) });
    }
    if (CONFIRMED.has(event)) {
      const end = row.endAt.getTime();
      await deps.enqueueJob("bookingEnded", { bookingId: row.id, expectedEnd: end }, { id: stableJobId(`ended:${row.id}:${end}`), startAfter: row.endAt });
    }
    const trigger = WEBHOOK_FOR[event];
    if (trigger) {
      await emitWebhooks(
        { db: deps.db, enqueue: (deliveryId) => deps.enqueueJob("webhookDeliver", { deliveryId }, { id: deliveryId }) },
        { trigger, bookingId: row.id, eventKey: `${row.id}:${event}:${row.sequence}` },
      );
    }
  }
}

const DECISION_TTL_MS = 30 * 24 * 3_600_000;

/** Signed one-click links for the host's request email (BKG-012); valid 30 days or until decided. */
export function decisionUrls(appUrl: string, secret: string, row: BookingRow, now: number) {
  const expiresAt = Math.min(now + DECISION_TTL_MS, Math.max(now, row.endAt.getTime()));
  const url = (action: "accept" | "reject") =>
    `${appUrl}/booking/${encodeURIComponent(row.uid)}/decide?action=${action}&exp=${expiresAt}&sig=${signAction(secret, { subject: row.id, action, expiresAt })}`;
  return { acceptUrl: url("accept"), rejectUrl: url("reject") };
}
