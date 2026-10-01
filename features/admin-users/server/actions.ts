"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { user } from "@/db/schema";
import { deleteAccount } from "@/features/account/server/service";
import { sendBookingEmails } from "@/features/bookings/server/send";
import { invalidatePublicContext } from "@/features/bookings/server/public-context";
import { getIntegrationDeps } from "@/features/calendars/server/runtime";
import { syncCancelled } from "@/features/calendars/server/sync";
import type { ActionState } from "@/lib/actions";
import { requireAdminAction } from "@/lib/auth/session";
import { errorSummary, logger } from "@/lib/logger";
import { type AdminActionResult, prepareUserDeletion, setUserDisabled, setUserRole } from "./service";

const FORBIDDEN: ActionState = { status: "error", message: "Only instance administrators can manage accounts." };

const REFUSALS = {
  SELF: "You can't remove your own access. Ask another administrator.",
  LAST_ADMIN: "This is the last active administrator. Make someone else an administrator first.",
  NOT_FOUND: "This account no longer exists.",
} as const;

const userId = z.string().min(1).max(100);
const roleInput = z.object({ userId, role: z.enum(["user", "admin"]) });
const disabledInput = z.object({ userId, disabled: z.enum(["true", "false"]).transform((v) => v === "true") });
const deleteInput = z.object({ userId, confirm: z.string().trim().toLowerCase() });

function done(result: AdminActionResult, success: string, log: Record<string, unknown>): ActionState {
  if (!result.allowed) return { status: "error", message: REFUSALS[result.reason] };
  logger.info("admin.user_updated", log);
  revalidatePath("/admin", "layout");
  invalidatePublicContext(); // disabled hosts stop taking bookings
  return { status: "success", message: success };
}

export async function setUserRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin) return FORBIDDEN;
  const parsed = roleInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  const { userId: target, role } = parsed.data;
  const result = await setUserRole(getDb(), admin.id, target, role);
  return done(result, role === "admin" ? "Now an administrator." : "No longer an administrator.", { action: role === "admin" ? "promote" : "demote", targetId: target, actorId: admin.id });
}

export async function setUserDisabledAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin) return FORBIDDEN;
  const parsed = disabledInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  const { userId: target, disabled } = parsed.data;
  const result = await setUserDisabled(getDb(), admin.id, target, disabled);
  return done(result, disabled ? "Account disabled and signed out." : "Account enabled.", { action: disabled ? "disable" : "enable", targetId: target, actorId: admin.id });
}

/** Deletes someone else's account (ADM-009), cancelling their bookings like a self-deletion (ADM-006). */
export async function deleteUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdminAction();
  if (!admin) return FORBIDDEN;
  const parsed = deleteInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  const db = getDb();
  const { userId: target, confirm } = parsed.data;
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, target));
  if (!row) return { status: "error", message: REFUSALS.NOT_FOUND };
  if (confirm !== row.email.toLowerCase()) {
    return { status: "error", message: "Type the account's email address exactly to confirm.", fieldErrors: { confirm: "Doesn't match" } };
  }
  const prepared = await prepareUserDeletion(db, admin.id, target);
  if (!prepared.allowed) return { status: "error", message: REFUSALS[prepared.reason] };
  let cancelled;
  try {
    cancelled = await deleteAccount(db, target, Date.now(), (bookingId) => syncCancelled(getIntegrationDeps(), bookingId));
  } catch (error) {
    // The account is already disabled and signed out; deleting again retries the rest.
    logger.error("admin.user_delete_failed", { targetId: target, actorId: admin.id, ...errorSummary(error) });
    revalidatePath("/admin", "layout");
    return { status: "error", message: "The account was disabled, but deleting it failed. Try deleting it again." };
  }
  for (const details of cancelled) await sendBookingEmails({ kind: "cancelled", details, skipHost: true });
  return done({ allowed: true }, "Account deleted.", { action: "delete", targetId: target, actorId: admin.id, cancelledBookings: cancelled.length });
}
