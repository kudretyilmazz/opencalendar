import type { Database } from "@/db/client";
import { findBookingById } from "@/features/bookings/server/service";
import { emitWebhooks } from "@/features/webhooks/server/emit";
import { bookingEndedPayload } from "@/lib/jobs/queues";
import { logger } from "@/lib/logger";

export type BookingEndedDeps = { db: Database; enqueueDelivery(deliveryId: string): Promise<void> };

/** MEETING_ENDED webhooks (API-001), for bookings that still end when the job was scheduled. */
export function createBookingEndedHandler(deps: BookingEndedDeps) {
  return async (jobs: { id: string; data: unknown }[]): Promise<void> => {
    for (const job of jobs) {
      const payload = bookingEndedPayload.parse(job.data);
      const details = await findBookingById(deps.db, payload.bookingId);
      if (!details || details.booking.status !== "accepted" || details.booking.endAt.getTime() !== payload.expectedEnd) {
        logger.info("booking.ended_skipped", { jobId: job.id });
        continue;
      }
      await emitWebhooks(
        { db: deps.db, enqueue: (id) => deps.enqueueDelivery(id) },
        { trigger: "MEETING_ENDED", bookingId: details.booking.id, eventKey: `${details.booking.id}:ended:${payload.expectedEnd}` },
      );
    }
  };
}
