/**
 * NFR-001 load test: slot API latency for 1 host over a 30-day window with cached calendar busy
 * times, 100 concurrent connections.
 *
 *   DATABASE_URL=… ENCRYPTION_KEY=… BASE_URL=http://localhost:3300 npx tsx scripts/loadtest.ts
 *
 * Seeds a verified host with a schedule, an event type, 60 bookings and a connected calendar whose
 * busy cache (400 events) is fresh, then runs autocannon. Each request uses a different client
 * address so the per-IP public rate limit (60/min) reflects many visitors, not one.
 */
import autocannon from "autocannon";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { calendarBusyCache, connectedCalendar, credential, user } from "@/db/schema";
import { createBooking } from "@/features/bookings/server/service";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import { createEventType, findPublicEventType, findPublicHost } from "@/features/event-types/server/service";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { createCipher } from "@/lib/crypto/encryption";

const DAY = 86_400_000;
const { DATABASE_URL, ENCRYPTION_KEY, BASE_URL = "http://localhost:3300" } = process.env;
if (!DATABASE_URL || !ENCRYPTION_KEY) throw new Error("Set DATABASE_URL and ENCRYPTION_KEY (same as the app)");

async function seed() {
  const { db, pool } = createDatabase(DATABASE_URL!, 5);
  const username = `load${Date.now().toString(36)}`;
  const userId = `load-${Date.now()}`;
  await db.insert(user).values({ id: userId, name: "Load Host", email: `${username}@example.com`, username, emailVerified: true, timeZone: "Europe/Istanbul" });
  await ensureDefaultSchedule(db, userId, "Europe/Istanbul");
  await createEventType(db, userId, eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title: "Load", slug: "load", minNoticeMinutes: 0, slotIntervalMinutes: 15 }));
  const host = (await findPublicHost(db, username))!;
  const eventType = (await findPublicEventType(db, host.id, "load"))!;

  const start = Math.ceil(Date.now() / DAY) * DAY + DAY;
  const end = start + 30 * DAY;
  // 60 existing bookings across the window.
  let made = 0;
  for (let d = 0; made < 60 && d < 30; d++) {
    for (const hourUtc of [7, 9, 11]) {
      const at = start + d * DAY + hourUtc * 3_600_000;
      await createBooking(db, {
        host,
        eventType,
        start: at,
        durationMin: 30,
        booker: { name: "B", email: `b${made}@example.com`, timeZone: "UTC", locale: "en" },
        guests: [],
        now: Date.now(),
      }).then(() => made++, () => undefined); // weekends are simply not bookable
    }
  }

  // A connected calendar with a fresh busy cache for the window (the "cached" condition).
  const cipher = createCipher({ current: ENCRYPTION_KEY! });
  const credentialId = `load-cred-${Date.now()}`;
  await db.insert(credential).values({
    id: credentialId,
    userId,
    provider: "ics_feed",
    label: `load feed ${Date.now()}`,
    encryptedPayload: cipher.encrypt(JSON.stringify({ url: "https://example.com/feed.ics" }), credentialId),
  });
  const calId = `load-cal-${Date.now()}`;
  await db.insert(connectedCalendar).values({ id: calId, credentialId, userId, externalId: "feed", name: "Feed", readOnly: true, checkConflicts: true });
  const busy = Array.from({ length: 400 }, (_, i) => ({ start: start + i * 6 * 3_600_000 + 30 * 60_000, end: start + i * 6 * 3_600_000 + 75 * 60_000 }));
  // fetched_at in the future keeps the entry fresh for the whole run.
  await db.insert(calendarBusyCache).values({ connectedCalendarId: calId, rangeStart: new Date(start), rangeEnd: new Date(end), busy, fetchedAt: new Date(Date.now() + 3_600_000) });
  const [check] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
  await pool.end();
  if (!check) throw new Error("seed failed");
  return { username, start, end, bookings: made };
}

async function main() {
  const { username, start, end, bookings } = await seed();
  const body = JSON.stringify({ username, slug: "load", duration: 30, start, end });

  // Warm-up (JIT, connection pools).
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${BASE_URL}/api/public/slots`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.18.0.${i}` }, body });
    if (!res.ok) throw new Error(`warm-up failed: ${res.status} ${await res.text()}`);
    if (i === 0) process.stdout.write(`slots in window: ${((await res.json()) as { slots: unknown[] }).slots.length}, bookings seeded: ${bookings}\n`);
  }

  let n = 0;
  const result = await autocannon({
    url: `${BASE_URL}/api/public/slots`,
    connections: 100,
    duration: 20,
    requests: [
      {
        method: "POST",
        body,
        setupRequest: (req) => {
          n++;
          return { ...req, headers: { ...req.headers, "content-type": "application/json", "x-forwarded-for": `100.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` } };
        },
      },
    ],
  });
  const l = result.latency;
  const summary = {
    requests: result.requests.total,
    non2xx: result.non2xx,
    errors: result.errors,
    rps: Math.round(result.requests.average),
    p50_ms: l.p50,
    p97_5_ms: l.p97_5,
    p99_ms: l.p99,
    max_ms: l.max,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  const pass = l.p97_5 < 300 && l.p99 < 800 && result.non2xx === 0 && result.errors === 0;
  process.stdout.write(pass ? "NFR-001 PASS (p95 ≤ p97.5 < 300 ms, p99 < 800 ms)\n" : "NFR-001 FAIL\n");
  process.exit(pass ? 0 : 1);
}

void main();
