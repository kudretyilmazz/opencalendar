import type { Job } from "pg-boss";
import type { Cipher } from "@/lib/crypto/encryption";
import { renderEmail } from "@/lib/email/templates";
import type { Mailer } from "@/lib/email/transport";
import { emailJobPayload, openEmail } from "@/lib/jobs/queues";
import { errorSummary, logger } from "@/lib/logger";

/**
 * Consumer for `email.send` (NTF-001). Throwing marks the job failed so pg-boss retries it with
 * exponential backoff; after the retry limit it moves to the dead-letter queue, which is how
 * failures are recorded.
 */
export function createEmailSendHandler(deps: { mailer: Mailer; from: string; cipher: Cipher }) {
  return async (jobs: Job<unknown>[]): Promise<void> => {
    for (const job of jobs) {
      let request;
      try {
        request = openEmail(deps.cipher, emailJobPayload.parse(job.data));
      } catch (error) {
        // Wrong key or a payload from an incompatible version: fail loudly, never silently.
        logger.error("email.invalid_payload", { jobId: job.id, ...errorSummary(error) });
        throw error;
      }
      const { to, ...content } = request;
      const rendered = await renderEmail(content);
      try {
        await deps.mailer.send({ from: deps.from, to, ...rendered });
        logger.info("email.sent", { jobId: job.id, template: content.template });
      } catch (error) {
        logger.warn("email.failed", { jobId: job.id, template: content.template, ...errorSummary(error) });
        throw error;
      }
    }
  };
}
