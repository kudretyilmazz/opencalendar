import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";

export type CheckResult = { ok: boolean; error?: string };
export type Readiness = { ok: boolean; checks: { database: CheckResult; jobQueue: CheckResult } };

async function check(fn: () => Promise<boolean>): Promise<CheckResult> {
  try {
    return (await fn()) ? { ok: true } : { ok: false, error: "not ready" };
  } catch (error) {
    // Only the error class name: messages can contain connection strings.
    return { ok: false, error: error instanceof Error ? error.name : "error" };
  }
}

/** Readiness (ADM-004): the database answers and the pg-boss schema is installed. */
export async function checkReadiness(db: Database, jobQueueInstalled: () => Promise<boolean>): Promise<Readiness> {
  const database = await check(async () => {
    await db.execute(sql`SELECT 1`);
    return true;
  });
  const jobQueue = database.ok ? await check(jobQueueInstalled) : { ok: false, error: "database unavailable" };
  return { ok: database.ok && jobQueue.ok, checks: { database, jobQueue } };
}
