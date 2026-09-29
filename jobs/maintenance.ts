import { and, isNotNull, lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import { booking, rateLimit } from "@/db/schema";
import { pruneExpiredHolds } from "@/features/bookings/server/service";
import { pruneBusyCache } from "@/features/calendars/server/busy";
import { pruneLoginAttempts } from "@/lib/auth/lockout";
import { logger } from "@/lib/logger";
import { pruneCaptchaSolutions } from "@/lib/security/captcha";

// Longest rate-limit window in use is 15 minutes; a day of margin keeps pruning obviously safe.
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;
/** Workflow steps run up to 30 days after a booking ends; after that its sealed token goes. */
export const SEALED_TOKEN_RETENTION_MS = 31 * 24 * 60 * 60 * 1000;

/** Scheduled every 15 minutes: bounds the growth of auth and booking-hold bookkeeping tables. */
export function createMaintenanceHandler(deps: { db: Database; now?: () => Date }) {
  return async (): Promise<void> => {
    const now = deps.now?.() ?? new Date();
    await pruneLoginAttempts(deps.db, now);
    await pruneExpiredHolds(deps.db, now.getTime());
    await pruneBusyCache(deps.db, now.getTime());
    await pruneCaptchaSolutions(deps.db, now.getTime());
    await deps.db.delete(rateLimit).where(lt(rateLimit.lastRequest, now.getTime() - RATE_LIMIT_RETENTION_MS));
    await deps.db
      .update(booking)
      .set({ manageTokenSealed: null })
      .where(and(isNotNull(booking.manageTokenSealed), lt(booking.endAt, new Date(now.getTime() - SEALED_TOKEN_RETENTION_MS))));
    logger.info("maintenance.pruned");
  };
}
