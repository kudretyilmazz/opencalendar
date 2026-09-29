import type { PgBoss } from "pg-boss";
import { createDatabase } from "@/db/client";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { createSmtpMailer } from "@/lib/email/transport";
import type { Env } from "@/lib/env";
import { startBoss } from "@/lib/jobs/boss";
import { logger } from "@/lib/logger";
import { registerWorkers } from "./register";

export type RunningWorker = { boss: PgBoss; stop: () => Promise<void> };

/** Starts the pg-boss worker role with all consumers. Used by worker.ts and WORKER_MODE=inline. */
export async function startWorker(env: Env): Promise<RunningWorker> {
  const { db, pool } = createDatabase(env.DATABASE_URL, 3);
  const boss = await startBoss(env.DATABASE_URL, "worker");
  await registerWorkers(boss, {
    db,
    mailer: createSmtpMailer(env),
    from: env.SMTP_FROM,
    cipher: cipherFromEnv(env),
    env,
  });
  logger.info("worker.started");
  return {
    boss,
    stop: async () => {
      await boss.stop({ graceful: true, timeout: 20_000 });
      await pool.end();
    },
  };
}
