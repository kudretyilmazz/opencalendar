"use server";

import { getDb } from "@/db/client";
import { sendBookingEmails } from "@/features/bookings/server/send";
import { getIntegrationDeps } from "@/features/calendars/server/runtime";
import { syncCancelled } from "@/features/calendars/server/sync";
import type { ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { deleteAccount } from "./service";

export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const confirmation = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (confirmation !== user.email.toLowerCase()) {
    return { status: "error", message: "Type your email address exactly to confirm.", fieldErrors: { confirm: "Doesn't match" } };
  }
  // External events/meetings must go before the credentials are deleted with the account.
  const cancelled = await deleteAccount(getDb(), user.id, Date.now(), (bookingId) => syncCancelled(getIntegrationDeps(), bookingId));
  for (const details of cancelled) {
    // Attendees only: the host account no longer exists.
    await sendBookingEmails({ kind: "cancelled", details, skipHost: true });
  }
  logger.info("account.deleted", { cancelledBookings: cancelled.length });
  // The client does a full page load afterwards so no state of the deleted account survives.
  return { status: "success", message: "Your account was deleted." };
}
