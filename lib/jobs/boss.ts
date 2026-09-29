import { PgBoss } from "pg-boss";
import { errorSummary, logger } from "@/lib/logger";
import { QUEUES } from "./queues";

/**
 * pg-boss lifecycle (ADR-0005). The web process uses a "producer" instance (no maintenance,
 * no cron); the worker process uses a full instance that also supervises queues.
 */

export type BossRole = "producer" | "worker";

export async function startBoss(connectionString: string, role: BossRole): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString,
    // Worker: one LISTEN connection plus several concurrent consumers.
    max: role === "producer" ? 3 : 12,
    supervise: role === "worker",
    schedule: role === "worker",
    // Wake workers the moment a job is sent (queues opt in with `notify`); polling stays on as a
    // fallback, e.g. behind PgBouncer in transaction mode.
    useListenNotify: role === "worker",
  });
  boss.on("error", (error) => logger.error("pgboss.error", errorSummary(error)));
  await boss.start();
  await ensureQueues(boss);
  return boss;
}

/** Creates every queue (and its dead-letter queue), or applies the current policy. Idempotent. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const queue of Object.values(QUEUES)) {
    if (!(await boss.getQueue(queue.deadLetter))) await boss.createQueue(queue.deadLetter);
    const options = { ...queue.options, deadLetter: queue.deadLetter };
    if (await boss.getQueue(queue.name)) await boss.updateQueue(queue.name, options);
    else await boss.createQueue(queue.name, options);
  }
}

// Producer singleton for the web process, kept on globalThis to survive dev hot reloads.
const globalForBoss = globalThis as unknown as { __opencalBoss?: Promise<PgBoss> };

export function getProducer(connectionString: string): Promise<PgBoss> {
  globalForBoss.__opencalBoss ??= startBoss(connectionString, "producer").catch((error) => {
    globalForBoss.__opencalBoss = undefined;
    throw error;
  });
  return globalForBoss.__opencalBoss;
}
