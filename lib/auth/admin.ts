import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { user } from "@/db/schema";

/**
 * First-run bootstrap (AUTH-005): promotes the given user to admin if the instance has no admin
 * yet. Runs after the user row is committed, under a global advisory lock, so two concurrent
 * first sign-ups can never both become admin. Returns true when the user was promoted.
 */
export async function promoteIfNoAdmin(db: Database, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('opencalendar:first-admin'))`);
    const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1);
    if (existing) return false;
    await tx.update(user).set({ role: "admin" }).where(eq(user.id, userId));
    return true;
  });
}
