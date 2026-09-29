import { getPool } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { EnvValidationError, getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Web process startup, called once from instrumentation.ts `register()` before requests are
 * served: validate config (ADM-002), migrate (ADM-001), optionally start inline workers.
 */
export async function bootstrap(): Promise<void> {
  let env;
  try {
    env = getEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  if (env.MIGRATE_ON_START) {
    await runMigrations(getPool());
    logger.info("db.migrated");
  }

  if (env.WORKER_MODE === "inline") {
    const { startWorker } = await import("@/jobs/start");
    const worker = await startWorker(env);
    // Let in-flight jobs finish when the web process is stopped (e.g. docker stop).
    process.once("SIGTERM", () => void worker.stop());
  }
}
