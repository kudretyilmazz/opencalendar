import { getDb } from "@/db/client";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { getEnv } from "@/lib/env";
import { enqueue } from "@/lib/jobs/enqueue";
import { sealEmail } from "@/lib/jobs/queues";
import type { ExternalBusyFn } from "@/features/bookings/server/service";
import { TtlCache } from "@/lib/ttl-cache";
import type { IntegrationDeps } from "./credentials";
import { BOOKING_MAX_AGE_MS, getExternalBusy } from "./busy";
import { createIntegrationDeps } from "./deps";

/** Web-process singleton of the integration layer. */
const globalForIntegrations = globalThis as unknown as { __opencalIntegrations?: IntegrationDeps };

export function getIntegrationDeps(): IntegrationDeps {
  if (!globalForIntegrations.__opencalIntegrations) {
    const env = getEnv();
    const cipher = cipherFromEnv(env);
    globalForIntegrations.__opencalIntegrations = createIntegrationDeps({
      db: getDb(),
      env,
      cipher,
      sendEmail: async (email) => {
        await enqueue("emailSend", sealEmail(cipher, email));
      },
    });
  }
  return globalForIntegrations.__opencalIntegrations;
}

/**
 * External busy provider for one host and event type (AVL-006), for booking and holding: cached
 * data older than BOOKING_MAX_AGE_MS is refetched, so a booking re-checks near-live calendars.
 */
export function externalBusyFor(host: { id: string; timeZone: string }, eventTypeId: string, maxAgeMs = BOOKING_MAX_AGE_MS): ExternalBusyFn {
  return async (window) =>
    (await getExternalBusy(getIntegrationDeps(), { userId: host.id, eventTypeId, window, timeZone: host.timeZone, maxAgeMs })).busy;
}

/**
 * Display-only variant for the public slot endpoint: results are memoized in-process for a few
 * seconds on top of the per-provider cache TTLs (NFR-001). Booking and holding use
 * `externalBusyFor`, which accepts much less stale data.
 */
const displayCache = new TtlCache<Awaited<ReturnType<ExternalBusyFn>>>(5_000, 5000);

export function cachedExternalBusyFor(host: { id: string; timeZone: string }, eventTypeId: string): ExternalBusyFn {
  const fresh = externalBusyFor(host, eventTypeId, Number.POSITIVE_INFINITY);
  return (window) => displayCache.get(`${host.id}|${eventTypeId}|${window.start}|${window.end}`, () => fresh(window));
}
