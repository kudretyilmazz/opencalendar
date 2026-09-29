/**
 * Background worker entry point (`node worker.js` in the image, `npm run worker:dev` locally).
 * Runs pg-boss consumers: email delivery and maintenance now; reminders, webhooks and calendar
 * sync in later milestones.
 */
import { startWorker } from "@/jobs/start";
import { EnvValidationError, getEnv } from "@/lib/env";
import { errorSummary, logger } from "@/lib/logger";

async function main() {
  const worker = await startWorker(getEnv());

  const shutdown = async (signal: string) => {
    logger.info("worker.stopping", { signal });
    await worker.stop();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  if (error instanceof EnvValidationError) process.stderr.write(`${error.message}\n`);
  else logger.error("worker.crashed", errorSummary(error));
  process.exit(1);
});
