import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";
import { checkReadiness } from "@/lib/health";
import { testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

describe("readiness (ADM-004)", () => {
  it("is ready when the database answers and the queue is installed", async () => {
    expect(await checkReadiness(db, async () => true)).toEqual({
      ok: true,
      checks: { database: { ok: true }, jobQueue: { ok: true } },
    });
  });

  it("reports the job queue as not ready", async () => {
    const result = await checkReadiness(db, async () => false);
    expect(result.ok).toBe(false);
    expect(result.checks.jobQueue.ok).toBe(false);
  });

  it("reports an unreachable database without leaking the connection string", async () => {
    const broken = createDatabase("postgres://user:hunter2@127.0.0.1:1/nope", 1);
    const result = await checkReadiness(broken.db, async () => true);
    await broken.pool.end();
    expect(result.ok).toBe(false);
    expect(result.checks.database.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });
});
