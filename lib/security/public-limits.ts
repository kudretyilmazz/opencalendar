import { getIPFromHeader } from "@better-auth/core/utils/ip";
import { getDb } from "@/db/client";
import { hitAccountLimit } from "@/lib/auth/lockout";
import { getEnv } from "@/lib/env";

/**
 * Rate limits for unauthenticated booking endpoints (docs/03-architecture/security.md).
 * Counters live in the shared `rate_limit` table (no Redis) and are pruned by the maintenance job.
 */
export const PUBLIC_LIMITS = {
  slots: { windowMs: 60_000, max: 60 },
  hold: { windowMs: 60_000, max: 30 },
  book: { windowMs: 60_000, max: 10 },
  bookPerEmail: { windowMs: 60 * 60_000, max: 10 },
  /** Emails to an address listed as a guest; separate so nobody can burn someone's own quota. */
  bookAsGuest: { windowMs: 60 * 60_000, max: 10 },
  cancel: { windowMs: 60_000, max: 10 },
  routing: { windowMs: 60_000, max: 20 },
  /** Per routing form, across all clients: caps how fast anyone can fill a form's responses. */
  routingForm: { windowMs: 60 * 60_000, max: 500 },
} as const;

export type PublicLimit = keyof typeof PUBLIC_LIMITS;

/**
 * Client IP: the right-most X-Forwarded-For hop that is not one of our trusted proxies, the same
 * resolution Better Auth uses, so a client can't choose its own apparent address.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  const ip = getIPFromHeader(forwarded, { trustedProxies: getEnv().TRUSTED_PROXIES });
  // Every hop trusted (e.g. a local Docker network): key on the nearest hop rather than one
  // shared "unknown" bucket that any single client could exhaust for everyone.
  return ip ?? forwarded.split(",").at(-1)?.trim() ?? "unknown";
}

const localBuckets = new Map<string, { windowStart: number; count: number }>();
const LOCAL_BUCKET_LIMIT = 50_000;

/**
 * In-process fixed-window limiter for the read-only slot endpoint: no database write on the
 * hottest path (NFR-001). With several replicas the effective limit is per replica, which is
 * fine for reads; everything that writes uses the shared database limiter below.
 */
export function overLocalLimit(kind: PublicLimit, subject: string, now = Date.now()): boolean {
  const { windowMs, max } = PUBLIC_LIMITS[kind];
  const key = `${kind}:${subject.toLowerCase()}`;
  const bucket = localBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    if (localBuckets.size >= LOCAL_BUCKET_LIMIT) localBuckets.clear();
    localBuckets.set(key, { windowStart: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

/** Counts one hit and returns true when `subject` is over the limit for `kind`. */
export async function overLimit(kind: PublicLimit, subject: string): Promise<boolean> {
  return hitAccountLimit(getDb(), { key: `pub:${kind}:${subject.toLowerCase()}`, ...PUBLIC_LIMITS[kind] });
}
