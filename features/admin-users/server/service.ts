import { and, count, desc, eq, ilike, isNotNull, isNull, max, or, type SQL } from "drizzle-orm";
import type { Database, Tx } from "@/db/client";
import { session, user } from "@/db/schema";
import { ADMIN_ROLE_LOCK } from "@/lib/auth/admin";
import { type AdminActionDecision, type AdminUserAction, checkAdminAction, type UserRole } from "@/lib/auth/policy";

export const USERS_PAGE_SIZE = 50;

export type UserFilter = { query?: string; role?: UserRole; status?: "active" | "disabled"; page?: number };

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: UserRole;
  emailVerified: boolean;
  disabledAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date | null;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

function where(filter: UserFilter): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];
  const query = filter.query?.trim();
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(or(ilike(user.email, pattern), ilike(user.name, pattern), ilike(user.username, pattern)));
  }
  if (filter.role) conditions.push(eq(user.role, filter.role));
  if (filter.status === "active") conditions.push(isNull(user.disabledAt));
  if (filter.status === "disabled") conditions.push(isNotNull(user.disabledAt));
  return and(...conditions);
}

/** Accounts for the admin user list (ADM-009), newest first, with their latest session activity. */
export async function listUsers(db: Database, filter: UserFilter): Promise<{ rows: AdminUserRow[]; total: number }> {
  const page = Math.max(1, filter.page ?? 1);
  const lastSeen = db
    .select({ userId: session.userId, lastSeenAt: max(session.updatedAt).as("last_seen_at") })
    .from(session)
    .groupBy(session.userId)
    .as("last_seen");
  const condition = where(filter);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        emailVerified: user.emailVerified,
        disabledAt: user.disabledAt,
        createdAt: user.createdAt,
        lastSeenAt: lastSeen.lastSeenAt,
      })
      .from(user)
      .leftJoin(lastSeen, eq(lastSeen.userId, user.id))
      .where(condition)
      .orderBy(desc(user.createdAt), user.id)
      .limit(USERS_PAGE_SIZE)
      .offset((page - 1) * USERS_PAGE_SIZE),
    db.select({ total: count() }).from(user).where(condition),
  ]);
  return { rows, total };
}

export async function userCounts(db: Database): Promise<{ total: number; admins: number; disabled: number }> {
  const [[{ total }], [{ admins }], [{ disabled }]] = await Promise.all([
    db.select({ total: count() }).from(user),
    db.select({ admins: count() }).from(user).where(and(eq(user.role, "admin"), isNull(user.disabledAt))),
    db.select({ disabled: count() }).from(user).where(isNotNull(user.disabledAt)),
  ]);
  return { total, admins, disabled };
}

export type AdminActionResult = AdminActionDecision | { allowed: false; reason: "NOT_FOUND" };

/**
 * Checks an admin action under the admin-role lock and, when allowed, applies `apply` in the same
 * transaction, so two admins can't concurrently remove each other and leave the instance with none.
 */
async function guarded(
  db: Database,
  actorId: string,
  targetId: string,
  action: AdminUserAction,
  apply: (tx: Tx) => Promise<unknown>,
): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    await tx.execute(ADMIN_ROLE_LOCK);
    const [target] = await tx.select({ id: user.id, role: user.role, disabledAt: user.disabledAt }).from(user).where(eq(user.id, targetId));
    if (!target) return { allowed: false, reason: "NOT_FOUND" } as const;
    const [{ activeAdminCount }] = await tx
      .select({ activeAdminCount: count() })
      .from(user)
      .where(and(eq(user.role, "admin"), isNull(user.disabledAt)));
    const decision = checkAdminAction({
      actorId,
      target: { id: target.id, role: target.role, disabled: target.disabledAt !== null },
      action,
      activeAdminCount,
    });
    if (decision.allowed) await apply(tx);
    return decision;
  });
}

// Sessions are dropped whenever access changes, so the new role or status applies at once.
const dropSessions = (tx: Tx, userId: string) => tx.delete(session).where(eq(session.userId, userId));

export function setUserRole(db: Database, actorId: string, targetId: string, role: UserRole): Promise<AdminActionResult> {
  return guarded(db, actorId, targetId, role === "admin" ? "promote" : "demote", async (tx) => {
    await tx.update(user).set({ role }).where(eq(user.id, targetId));
    await dropSessions(tx, targetId);
  });
}

export function setUserDisabled(db: Database, actorId: string, targetId: string, disabled: boolean, now = new Date()): Promise<AdminActionResult> {
  return guarded(db, actorId, targetId, disabled ? "disable" : "enable", async (tx) => {
    await tx.update(user).set({ disabledAt: disabled ? now : null }).where(eq(user.id, targetId));
    if (disabled) await dropSessions(tx, targetId);
  });
}

/**
 * First step of deleting someone else's account: under the lock, takes away admin rights and
 * access, so the account no longer counts as an admin while the (slower) deletion runs.
 */
export function prepareUserDeletion(db: Database, actorId: string, targetId: string, now = new Date()): Promise<AdminActionResult> {
  return guarded(db, actorId, targetId, "delete", async (tx) => {
    await tx.update(user).set({ role: "user", disabledAt: now }).where(eq(user.id, targetId));
    await dropSessions(tx, targetId);
  });
}
