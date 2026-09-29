import { randomUUID } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { loginAttempt, rateLimit } from "@/db/schema";
import { evaluateLockout, LOCKOUT_WINDOW_MS, type LockoutState } from "./policy";

const normalize = (email: string) => email.trim().toLowerCase();

export async function getLockoutState(db: Database, email: string, now = new Date()): Promise<LockoutState> {
  const rows = await db
    .select({ createdAt: loginAttempt.createdAt })
    .from(loginAttempt)
    .where(
      and(
        eq(loginAttempt.email, normalize(email)),
        gt(loginAttempt.createdAt, new Date(now.getTime() - LOCKOUT_WINDOW_MS)),
      ),
    );
  return evaluateLockout(
    rows.map((r) => r.createdAt),
    now,
  );
}

/**
 * Atomically checks the lockout and reserves an attempt row for this sign-in (AUTH-004).
 * A per-email advisory lock serializes concurrent guesses, so a parallel burst cannot slip
 * past the threshold. The reservation stays if the password is wrong, is cleared (with all
 * earlier failures) on success, and is released for outcomes that aren't password guesses.
 */
export async function reserveSignInAttempt(
  db: Database,
  email: string,
  ipAddress: string | null,
  now = new Date(),
): Promise<LockoutState> {
  const key = normalize(email);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`login:${key}`}))`);
    const rows = await tx
      .select({ createdAt: loginAttempt.createdAt })
      .from(loginAttempt)
      .where(and(eq(loginAttempt.email, key), gt(loginAttempt.createdAt, new Date(now.getTime() - LOCKOUT_WINDOW_MS))));
    const state = evaluateLockout(
      rows.map((r) => r.createdAt),
      now,
    );
    if (!state.locked) await tx.insert(loginAttempt).values({ id: randomUUID(), email: key, ipAddress, createdAt: now });
    return state;
  });
}

/** Removes the most recent reserved attempt (the sign-in failed for a non-password reason). */
export async function releaseLatestAttempt(db: Database, email: string): Promise<void> {
  const key = normalize(email);
  await db.execute(
    sql`DELETE FROM ${loginAttempt} WHERE ${loginAttempt.id} = (
      SELECT ${loginAttempt.id} FROM ${loginAttempt} WHERE ${loginAttempt.email} = ${key}
      ORDER BY ${loginAttempt.createdAt} DESC LIMIT 1)`,
  );
}

export async function recordFailedLogin(db: Database, email: string, ipAddress: string | null): Promise<void> {
  await db.insert(loginAttempt).values({ id: randomUUID(), email: normalize(email), ipAddress });
}

export async function clearFailedLogins(db: Database, email: string): Promise<void> {
  await db.delete(loginAttempt).where(eq(loginAttempt.email, normalize(email)));
}

export async function pruneLoginAttempts(db: Database, now = new Date()): Promise<void> {
  await db.delete(loginAttempt).where(lt(loginAttempt.createdAt, new Date(now.getTime() - LOCKOUT_WINDOW_MS)));
}

/**
 * Fixed-window counter keyed per account (AUTH-004 "per account"), stored in the same table as
 * Better Auth's per-IP limiter. Returns true when the request is over the limit.
 */
export async function hitAccountLimit(
  db: Database,
  input: { key: string; windowMs: number; max: number; now?: Date },
): Promise<boolean> {
  const now = (input.now ?? new Date()).getTime();
  const windowStart = now - input.windowMs;
  const [row] = await db
    .insert(rateLimit)
    .values({ id: randomUUID(), key: input.key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${rateLimit.lastRequest} < ${windowStart} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${rateLimit.lastRequest} < ${windowStart} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
      },
    })
    .returning({ count: rateLimit.count });
  return row.count > input.max;
}
