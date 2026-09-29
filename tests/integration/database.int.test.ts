import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/db/migrate";
import { user } from "@/db/schema";
import { hitAccountLimit, pruneLoginAttempts, recordFailedLogin, getLockoutState } from "@/lib/auth/lockout";
import { LOCKOUT_MAX_FAILURES, LOCKOUT_WINDOW_MS } from "@/lib/auth/policy";
import { resetDatabase, testDatabase } from "./helpers";

const { db, url, close } = testDatabase();
afterAll(close);
beforeEach(() => resetDatabase(db));

describe("migrations (ADM-001, NFR-013)", () => {
  it("are idempotent and safe to run concurrently", async () => {
    const pools = [new Pool({ connectionString: url }), new Pool({ connectionString: url })];
    await Promise.all(pools.map((p) => runMigrations(p)));
    await Promise.all(pools.map((p) => p.end()));
  });

  it("enable btree_gist for the booking exclusion constraint", async () => {
    const result = await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'`);
    expect(result.rows).toHaveLength(1);
  });

  it("enforce case-insensitive unique emails", async () => {
    await db.insert(user).values({ id: "u1", name: "A", email: "Ada@Example.com" });
    await expect(db.insert(user).values({ id: "u2", name: "B", email: "ada@example.com" })).rejects.toThrow();
  });
});

describe("lockout storage (AUTH-004)", () => {
  it("locks after the maximum number of recent failures", async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i++) await recordFailedLogin(db, "Ada@Example.com", null);
    expect((await getLockoutState(db, "ada@example.com")).locked).toBe(true);
  });

  it("prunes attempts outside the window", async () => {
    await recordFailedLogin(db, "ada@example.com", null);
    await pruneLoginAttempts(db, new Date(Date.now() + LOCKOUT_WINDOW_MS + 1000));
    expect((await getLockoutState(db, "ada@example.com")).locked).toBe(false);
    const rows = await db.execute(sql`SELECT count(*)::int AS n FROM login_attempt`);
    expect(rows.rows[0]).toEqual({ n: 0 });
  });

  it("counts per-account requests in a fixed window and resets afterwards", async () => {
    const now = new Date("2026-09-28T12:00:00Z");
    const hit = (at: Date) => hitAccountLimit(db, { key: "acct:test", windowMs: 60_000, max: 2, now: at });
    expect(await hit(now)).toBe(false);
    expect(await hit(now)).toBe(false);
    expect(await hit(now)).toBe(true);
    expect(await hit(new Date(now.getTime() + 61_000))).toBe(false);
  });
});

describe("maintenance job", () => {
  it("prunes expired login attempts and stale rate-limit rows only", async () => {
    const { createMaintenanceHandler, RATE_LIMIT_RETENTION_MS } = await import("@/jobs/maintenance");
    const { loginAttempt, rateLimit } = await import("@/db/schema");
    const now = new Date("2026-09-28T12:00:00Z");
    await db.insert(loginAttempt).values([
      { id: "old", email: "a@x.test", createdAt: new Date(now.getTime() - LOCKOUT_WINDOW_MS - 1) },
      { id: "new", email: "a@x.test", createdAt: now },
    ]);
    await db.insert(rateLimit).values([
      { id: "r1", key: "stale", count: 1, lastRequest: now.getTime() - RATE_LIMIT_RETENTION_MS - 1 },
      { id: "r2", key: "fresh", count: 1, lastRequest: now.getTime() },
    ]);

    await createMaintenanceHandler({ db, now: () => now })();

    expect((await db.select({ id: loginAttempt.id }).from(loginAttempt)).map((r) => r.id)).toEqual(["new"]);
    expect((await db.select({ key: rateLimit.key }).from(rateLimit)).map((r) => r.key)).toEqual(["fresh"]);
  });
});
