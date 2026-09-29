import { cipherFromEnv } from "@/lib/crypto/encryption";
import { getEnv } from "@/lib/env";
import { enqueue } from "@/lib/jobs/enqueue";
import { sealEmail } from "@/lib/jobs/queues";
import { errorSummary, logger } from "@/lib/logger";
import { type BookingEmailEvent, buildBookingEmails } from "./notifications";

/**
 * Queues booking emails after the booking transaction committed. A queueing failure must not
 * turn a successful booking into an error for the booker, so it is logged instead of thrown.
 */
export async function sendBookingEmails(event: BookingEmailEvent, now = Date.now()): Promise<void> {
  const env = getEnv();
  const cipher = cipherFromEnv(env);
  let emails;
  try {
    emails = buildBookingEmails(event, env.APP_URL, now);
  } catch (error) {
    logger.error("booking.email_build_failed", { bookingId: event.details.booking.id, ...errorSummary(error) });
    return;
  }
  // One bad recipient (e.g. an invalid address or oversized field) must not silence the others.
  for (const email of emails) {
    try {
      await enqueue("emailSend", sealEmail(cipher, email));
    } catch (error) {
      logger.error("booking.email_enqueue_failed", {
        bookingId: event.details.booking.id,
        template: email.template,
        ...errorSummary(error),
      });
    }
  }
}
