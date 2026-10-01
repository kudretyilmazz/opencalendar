import type { PgBoss } from "pg-boss";
import type { Database } from "@/db/client";
import { createIntegrationDeps } from "@/features/calendars/server/deps";
import { emailBranding } from "@/features/instance/email-branding";
import { getInstanceSettings } from "@/features/instance/server/service";
import { createWebhookDeliverHandler } from "@/features/webhooks/server/deliver";
import type { Cipher } from "@/lib/crypto/encryption";
import type { Mailer } from "@/lib/email/transport";
import type { Env } from "@/lib/env";
import { enqueueWith } from "@/lib/jobs/enqueue";
import { type EmailRequest, QUEUES, SCHEDULES, sealEmail } from "@/lib/jobs/queues";
import type { EnqueueJob } from "./booking-effects";
import { createBookingEndedHandler } from "./booking-ended";
import { createBookingProcessHandler } from "./booking-process";
import { createEmailSendHandler } from "./email-send";
import { createMaintenanceHandler } from "./maintenance";
import { createWorkflowRunHandler } from "./workflow-run";

export type WorkerDeps = { db: Database; mailer: Mailer; from: string; cipher: Cipher; env: Env };

/** Registers every queue consumer and cron schedule on a started pg-boss worker instance. */
export async function registerWorkers(boss: PgBoss, deps: WorkerDeps): Promise<void> {
  const enqueueEmail = async (email: EmailRequest, id?: string) => {
    await enqueueWith(boss, "emailSend", sealEmail(deps.cipher, email), id ? { id } : {});
  };
  const integrations = createIntegrationDeps({ db: deps.db, env: deps.env, cipher: deps.cipher, sendEmail: enqueueEmail });
  const enqueueJob: EnqueueJob = async (key, payload, options) => {
    await enqueueWith(boss, key, payload, options);
  };

  // batchSize 1: a failure retries only that job, so already-done work is never repeated.
  // Throughput comes from concurrent consumers instead (plus LISTEN/NOTIFY wake-ups).
  // Retries and delayed jobs (reminders) send no NOTIFY, so the backstop poll stays short.
  const polling = { pollingIntervalSeconds: 1, notifyPollingIntervalSeconds: 2 };
  await boss.work(
    QUEUES.emailSend.name,
    { batchSize: 1, localConcurrency: 4, ...polling },
    createEmailSendHandler({
      ...deps,
      branding: async () => emailBranding(await getInstanceSettings(deps.db), deps.env.APP_URL),
    }),
  );
  await boss.work(
    QUEUES.bookingProcess.name,
    { batchSize: 1, includeMetadata: true, localConcurrency: 2, ...polling },
    createBookingProcessHandler({ db: deps.db, cipher: deps.cipher, appUrl: deps.env.APP_URL, authSecret: deps.env.AUTH_SECRET, integrations, enqueueEmail, enqueueJob }),
  );
  await boss.work(QUEUES.workflowRun.name, { batchSize: 1, localConcurrency: 2, ...polling }, createWorkflowRunHandler({ db: deps.db, appUrl: deps.env.APP_URL, cipher: deps.cipher, enqueueEmail }));
  await boss.work(
    QUEUES.bookingEnded.name,
    { batchSize: 1 },
    createBookingEndedHandler({ db: deps.db, enqueueDelivery: (deliveryId) => enqueueJob("webhookDeliver", { deliveryId }, { id: deliveryId }) }),
  );
  await boss.work(
    QUEUES.webhookDeliver.name,
    { batchSize: 1, includeMetadata: true, localConcurrency: 4, ...polling },
    createWebhookDeliverHandler({ db: deps.db, cipher: deps.cipher, allowPrivate: deps.env.WEBHOOK_ALLOW_PRIVATE }),
  );
  await boss.work(QUEUES.maintenance.name, createMaintenanceHandler({ db: deps.db }));
  for (const { queue, cron } of SCHEDULES) await boss.schedule(queue, cron);
}
