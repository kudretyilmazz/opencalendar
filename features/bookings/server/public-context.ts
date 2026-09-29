import { getDb } from "@/db/client";
import { scheduleForEventType } from "@/features/schedules/server/service";
import { TtlCache } from "@/lib/ttl-cache";
import { resolveBookingTarget, type TargetKey } from "./targets";

/**
 * Booking target (and, for a single host, the schedule) for the public slot endpoint, cached for
 * a few seconds per process (NFR-001: this is the hottest read path). Only slot *display* uses
 * it; creating a booking always re-reads everything and re-validates, so staleness can't
 * double-book. Host-side saves call `invalidatePublicContext` so their own process shows changes
 * at once; other replicas catch up within the TTL.
 */
export const PUBLIC_CONTEXT_TTL_MS = 10_000;

async function load(key: TargetKey) {
  const db = getDb();
  const target = await resolveBookingTarget(db, key);
  if (!target) return null;
  const schedule = target.hosts ? undefined : await scheduleForEventType(db, target.host.id, target.eventType.scheduleId);
  return { target, host: target.host, eventType: target.eventType, schedule };
}

// On globalThis so host-side saves (Server Actions) clear the same cache the slot route reads:
// Next.js bundles them separately, but in one process.
const globalCaches = globalThis as typeof globalThis & { __ocPublicContextCache?: TtlCache<Awaited<ReturnType<typeof load>>> };
const cache = (globalCaches.__ocPublicContextCache ??= new TtlCache<Awaited<ReturnType<typeof load>>>(PUBLIC_CONTEXT_TTL_MS, 2000));

export function publicBookingContext(key: TargetKey) {
  const id = [key.team ?? "", key.username ?? "", key.slug].map((v) => v.toLowerCase()).join("/");
  return cache.get(id, () => load(key));
}

export function invalidatePublicContext(): void {
  cache.clear();
}
