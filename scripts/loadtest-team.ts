/**
 * NFR-002 load test: team slot API latency — a round-robin and a collective event type with 10
 * hosts, a 30-day window and cached calendar busy times.
 *
 *   DATABASE_URL=… ENCRYPTION_KEY=… BASE_URL=http://localhost:3300 npx tsx scripts/loadtest-team.ts
 *
 * Seeds a team of 10 verified hosts (default schedules in different zones, 20 bookings each and a
 * connected calendar whose busy cache holds 200 events), then runs autocannon with 20 concurrent
 * connections for 20 s per event type. Passes when p97.5 (≥ p95) < 800 ms with no errors.
 */
import autocannon from "autocannon";
import { createDatabase, type Database } from "@/db/client";
import { booking, bookingHost, calendarBusyCache, connectedCalendar, credential, membership, user } from "@/db/schema";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { createTeamEventType, setHosts } from "@/features/teams/server/event-types";
import { createTeam } from "@/features/teams/server/service";
import { createCipher } from "@/lib/crypto/encryption";
import { newId, randomToken } from "@/lib/ids";

const DAY = 86_400_000;
const HOSTS = 10;
const ZONES = ["Europe/Istanbul", "Europe/Berlin", "Europe/London", "America/New_York", "UTC"];
const { DATABASE_URL, ENCRYPTION_KEY, BASE_URL = "http://localhost:3300" } = process.env;
if (!DATABASE_URL || !ENCRYPTION_KEY) throw new Error("Set DATABASE_URL and ENCRYPTION_KEY (same as the app)");

/** 20 bookings per host, inserted directly (no availability checks needed for seeding). */
async function seedBookings(db: Database, userId: string, eventTypeId: string, start: number, seed: number) {
  for (let i = 0; i < 20; i++) {
    const at = start + ((i * 3 + seed) % 30) * DAY + (8 + ((i + seed) % 8)) * 3_600_000;
    const id = newId();
    await db.insert(booking).values({
      id,
      uid: randomToken(16),
      manageTokenHash: randomToken(16),
      icalUid: randomToken(16),
      eventTypeId,
      organizerId: userId,
      status: "accepted",
      title: "Seed",
      startAt: new Date(at),
      endAt: new Date(at + 30 * 60_000),
      timeZone: "UTC",
    });
    await db.insert(bookingHost).values({ bookingId: id, userId, blockedStart: new Date(at), blockedEnd: new Date(at + 30 * 60_000) }).catch(() => undefined);
  }
}

async function seedCalendar(db: Database, userId: string, start: number, end: number) {
  const cipher = createCipher({ current: ENCRYPTION_KEY! });
  const credentialId = `lt-cred-${userId}`;
  await db.insert(credential).values({
    id: credentialId,
    userId,
    provider: "ics_feed",
    label: `load feed ${userId}`,
    encryptedPayload: cipher.encrypt(JSON.stringify({ url: "https://example.com/feed.ics" }), credentialId),
  });
  const calId = `lt-cal-${userId}`;
  await db.insert(connectedCalendar).values({ id: calId, credentialId, userId, externalId: "feed", name: "Feed", readOnly: true, checkConflicts: true });
  const busy = Array.from({ length: 200 }, (_, i) => ({ start: start + i * 3.6 * 3_600_000, end: start + i * 3.6 * 3_600_000 + 45 * 60_000 }));
  await db.insert(calendarBusyCache).values({ connectedCalendarId: calId, rangeStart: new Date(start), rangeEnd: new Date(end), busy, fetchedAt: new Date(Date.now() + 3_600_000) });
}

async function seed() {
  const { db, pool } = createDatabase(DATABASE_URL!, 5);
  const stamp = Date.now().toString(36);
  const ids = Array.from({ length: HOSTS }, (_, i) => `lt-${stamp}-${i}`);
  for (const [i, id] of ids.entries()) {
    const timeZone = ZONES[i % ZONES.length];
    await db.insert(user).values({ id, name: `Host ${i}`, email: `${id}@example.com`, username: `lt${stamp}${i}`, emailVerified: true, timeZone });
    await ensureDefaultSchedule(db, id, timeZone);
  }
  const teamSlug = `lt-${stamp}`;
  const teamId = await createTeam(db, ids[0], { name: "Load team", slug: teamSlug, logoUrl: null, brandColor: null });
  await db.insert(membership).values(ids.slice(1).map((userId) => ({ teamId, userId, role: "member" as const })));
  const form = (slug: string) => eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title: slug, slug, minNoticeMinutes: 0, slotIntervalMinutes: 15, horizonDays: 60 });
  const rr = await createTeamEventType(db, ids[0], teamId, "round_robin", form("rr"));
  const collective = await createTeamEventType(db, ids[0], teamId, "collective", form("collective"));
  const hosts = ids.map((userId) => ({ userId, isFixed: false, weight: 100, priority: 2 }));
  await setHosts(db, ids[0], teamId, rr, { hosts, roundRobinWindowDays: 30 });
  await setHosts(db, ids[0], teamId, collective, { hosts, roundRobinWindowDays: 30 });

  const start = Math.ceil(Date.now() / DAY) * DAY + DAY;
  const end = start + 30 * DAY;
  for (const [i, id] of ids.entries()) {
    await seedBookings(db, id, rr, start, i);
    await seedCalendar(db, id, start, end);
  }
  await pool.end();
  return { teamSlug, start, end };
}

async function run(label: string, body: string) {
  for (let i = 0; i < 10; i++) {
    const res = await fetch(`${BASE_URL}/api/public/slots`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `198.18.1.${i}` }, body });
    if (!res.ok) throw new Error(`${label} warm-up failed: ${res.status} ${await res.text()}`);
    if (i === 0) process.stdout.write(`${label}: ${((await res.json()) as { slots: unknown[] }).slots.length} slots in the window\n`);
  }
  let n = 0;
  const result = await autocannon({
    url: `${BASE_URL}/api/public/slots`,
    connections: 20,
    duration: 20,
    requests: [
      {
        method: "POST",
        body,
        setupRequest: (req) => {
          n++;
          return { ...req, headers: { ...req.headers, "content-type": "application/json", "x-forwarded-for": `101.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` } };
        },
      },
    ],
  });
  const l = result.latency;
  const summary = { label, requests: result.requests.total, non2xx: result.non2xx, errors: result.errors, rps: Math.round(result.requests.average), p50_ms: l.p50, p97_5_ms: l.p97_5, p99_ms: l.p99, max_ms: l.max };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  return l.p97_5 < 800 && result.non2xx === 0 && result.errors === 0;
}

async function main() {
  const { teamSlug, start, end } = await seed();
  const body = (slug: string) => JSON.stringify({ team: teamSlug, slug, duration: 30, start, end });
  const rr = await run("round_robin", body("rr"));
  const collective = await run("collective", body("collective"));
  const pass = rr && collective;
  process.stdout.write(pass ? "NFR-002 PASS (p95 ≤ p97.5 < 800 ms, 10 hosts, 30 days)\n" : "NFR-002 FAIL\n");
  process.exit(pass ? 0 : 1);
}

void main();
