import path from "node:path";
import { sql } from "drizzle-orm";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { user } from "@/db/schema";
import { createBooking, findBookingById } from "@/features/bookings/server/service";
import { getExternalBusy } from "@/features/calendars/server/busy";
import { connectAccount, listConnections } from "@/features/calendars/server/connections";
import { defaultFetchFor, type IntegrationDeps } from "@/features/calendars/server/credentials";
import { syncCancelled, syncCreated, syncRescheduled } from "@/features/calendars/server/sync";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import { createEventType, findPublicEventType, findPublicHost } from "@/features/event-types/server/service";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { createCipher } from "@/lib/crypto/encryption";
import { parseEnv } from "@/lib/env";
import { getProvider } from "@/lib/integrations/registry";
import { resetDatabase, testDatabase } from "./helpers";

/**
 * CalDAV against a real server (Radicale in a container): discovery, busy times with a
 * recurring event, and create/update/delete of booking events (INT-004).
 */

const { db, close } = testDatabase();
let radicale: StartedTestContainer;
let base = "";
const AUTH = `Basic ${Buffer.from("host:hostpass").toString("base64")}`;

beforeAll(async () => {
  const dir = path.join(process.cwd(), "dev", "radicale");
  radicale = await new GenericContainer("tomsquest/docker-radicale:latest")
    .withCopyFilesToContainer([
      { source: path.join(dir, "config"), target: "/config/config" },
      { source: path.join(dir, "users"), target: "/config/users" },
    ])
    .withExposedPorts(5232)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  base = `http://${radicale.getHost()}:${radicale.getMappedPort(5232)}`;
  const mk = await fetch(`${base}/host/work/`, {
    method: "MKCALENDAR",
    headers: { authorization: AUTH, "content-type": "application/xml" },
    body: `<?xml version="1.0"?><C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:set><D:prop><D:displayname>Work</D:displayname></D:prop></D:set></C:mkcalendar>`,
  });
  expect(mk.status).toBe(201);
}, 180_000);

afterAll(async () => {
  await close();
  await radicale?.stop();
});

const env = () =>
  parseEnv({
    DATABASE_URL: "postgres://x@localhost/x",
    APP_URL: "https://cal.example.com",
    AUTH_SECRET: "x".repeat(32),
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    SMTP_HOST: "localhost",
    SMTP_FROM: "t@x.test",
    ALLOW_PRIVATE_NETWORK_INTEGRATIONS: "true", // the container runs on localhost
  });

const deps = (): IntegrationDeps => {
  const e = env();
  return { db, env: e, cipher: createCipher({ current: e.ENCRYPTION_KEY }), fetchFor: defaultFetchFor(e), now: () => Date.parse("2026-10-01T08:00:00Z"), onCredentialInvalid: async () => undefined };
};

const put = (name: string, ics: string) =>
  fetch(`${base}/host/work/${name}`, { method: "PUT", headers: { authorization: AUTH, "content-type": "text/calendar" }, body: ics });

const get = (url: string) => fetch(url, { headers: { authorization: AUTH } });

async function setup() {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "booking", "schedule", "event_type", "credential" CASCADE`);
  await db.insert(user).values({ id: "h1", name: "Hana", email: "hana@example.com", username: "hana", emailVerified: true, timeZone: "Europe/Istanbul" });
  await ensureDefaultSchedule(db, "h1", "Europe/Istanbul");
  await createEventType(db, "h1", eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title: "Intro", slug: "intro", minNoticeMinutes: 0 }));
  const host = (await findPublicHost(db, "hana"))!;
  const eventType = (await findPublicEventType(db, host.id, "intro"))!;
  await connectAccount(deps(), { userId: "h1", provider: getProvider("caldav"), label: "host@radicale", payload: { serverUrl: `${base}/`, username: "host", password: "hostpass" } });
  return { host, eventType };
}

describe("CalDAV with a real server (INT-004)", () => {
  beforeEach(async () => {
    for (const name of ["standup.ics"]) await fetch(`${base}/host/work/${name}`, { method: "DELETE", headers: { authorization: AUTH } });
  });

  it("discovers calendars and reads busy times, expanding recurrences in the host's zone", async () => {
    await setup();
    const [conn] = await listConnections(db, "h1");
    expect(conn.calendars.map((c) => [c.name, c.checkConflicts, c.isDestination])).toEqual([["Work", true, true]]);

    // Weekly stand-up, Mondays 10:00–10:30 Istanbul time (07:00 UTC), one week excepted.
    const created = await put(
      "standup.ics",
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//test//EN",
        "BEGIN:VEVENT",
        "UID:standup-1",
        "DTSTAMP:20260901T000000Z",
        "DTSTART;TZID=Europe/Istanbul:20260907T100000",
        "DTEND;TZID=Europe/Istanbul:20260907T103000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO",
        "EXDATE;TZID=Europe/Istanbul:20261012T100000",
        "SUMMARY:Stand-up",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );
    expect(created.status).toBe(201);

    const window = { start: Date.parse("2026-10-05T00:00:00Z"), end: Date.parse("2026-10-20T00:00:00Z") };
    const result = await getExternalBusy(deps(), { userId: "h1", window, timeZone: "Europe/Istanbul" });
    expect(result.degraded).toBe(false);
    expect(result.busy.map((b) => new Date(b.start).toISOString())).toEqual(["2026-10-05T07:00:00.000Z", "2026-10-19T07:00:00.000Z"]);
  });

  it("writes bookings to the calendar, updates them on reschedule and deletes them on cancel", async () => {
    const s = await setup();
    const now = Date.parse("2026-10-01T08:00:00Z");
    const booker = { name: "Grace", email: "grace@example.com", timeZone: "UTC", locale: "en" };
    const first = await createBooking(db, { host: s.host, eventType: s.eventType, start: Date.parse("2026-10-06T07:00:00Z"), durationMin: 30, booker, guests: [], now });
    const out = await syncCreated(deps(), (await findBookingById(db, first.booking.id))!);
    expect(out.failures).toEqual([]);
    const objectUrl = new URL(`${first.booking.icalUid}@cal.example.com.ics`.replace("@", "%40"), `${base}/host/work/`).toString();
    const stored = await get(objectUrl);
    expect(stored.status).toBe(200);
    const ics = await stored.text();
    expect(ics).toContain(`UID:${first.booking.icalUid}@cal.example.com`);
    expect(ics).not.toContain("METHOD:");

    // Our own event doesn't count as an external conflict.
    const window = { start: Date.parse("2026-10-06T00:00:00Z"), end: Date.parse("2026-10-07T00:00:00Z") };
    expect((await getExternalBusy({ ...deps(), now: () => now + 10 * 60_000 }, { userId: "h1", window, timeZone: "Europe/Istanbul" })).busy).toEqual([]);

    const moved = await createBooking(db, {
      host: s.host,
      eventType: s.eventType,
      start: Date.parse("2026-10-06T08:00:00Z"),
      durationMin: 30,
      booker,
      guests: [],
      now,
      reschedule: { uid: first.booking.uid, token: first.token },
    });
    expect((await syncRescheduled(deps(), (await findBookingById(db, moved.booking.id))!, first.booking.id)).failures).toEqual([]);
    expect(await (await get(objectUrl)).text()).toContain("DTSTART:20261006T080000Z");

    expect((await syncCancelled(deps(), moved.booking.id)).failures).toEqual([]);
    expect((await get(objectUrl)).status).toBe(404);
  });

  it("rejects wrong credentials without storing them", async () => {
    await resetDatabase(db);
    await db.execute(sql`TRUNCATE "credential" CASCADE`);
    await db.insert(user).values({ id: "h1", name: "Hana", email: "hana@example.com" });
    await expect(
      connectAccount(deps(), { userId: "h1", provider: getProvider("caldav"), label: "host@radicale", payload: { serverUrl: `${base}/`, username: "host", password: "wrong" } }),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(await listConnections(db, "h1")).toEqual([]);
  });

  it("blocks private addresses unless explicitly allowed (SSRF)", async () => {
    await resetDatabase(db);
    await db.insert(user).values({ id: "h1", name: "Hana", email: "hana@example.com" });
    const strict = parseEnv({ ...Object.fromEntries(Object.entries(env()).filter(([, v]) => typeof v === "string")), ALLOW_PRIVATE_NETWORK_INTEGRATIONS: "false" } as Record<string, string>);
    const strictDeps: IntegrationDeps = { ...deps(), env: strict, fetchFor: defaultFetchFor(strict) };
    await expect(
      connectAccount(strictDeps, { userId: "h1", provider: getProvider("caldav"), label: "x", payload: { serverUrl: `${base}/`, username: "host", password: "hostpass" } }),
    ).rejects.toMatchObject({ kind: "invalid" });
  });
});
