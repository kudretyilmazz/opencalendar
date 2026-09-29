import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { booking, bookingReference, credential, user } from "@/db/schema";
import { cancelBySystem, createBooking, findBookingById, getAvailableSlots } from "@/features/bookings/server/service";
import { createBookingProcessHandler, RetrySyncError, stableJobId } from "@/jobs/booking-process";
import { getExternalBusy } from "@/features/calendars/server/busy";
import {
  connectAccount,
  disconnectAccount,
  listConnections,
  setConflictCheck,
  setDestination,
  setEventTypeCalendars,
  syncCalendarList,
} from "@/features/calendars/server/connections";
import { type IntegrationDeps, withCredential } from "@/features/calendars/server/credentials";
import { syncCancelled, syncCreated, syncRescheduled } from "@/features/calendars/server/sync";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import { createEventType, findPublicEventType, findPublicHost } from "@/features/event-types/server/service";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { createCipher } from "@/lib/crypto/encryption";
import { parseEnv } from "@/lib/env";
import { googleEventId } from "@/lib/integrations/google";
import { getProvider } from "@/lib/integrations/registry";
import { createFakeGoogle, createFakeZoom } from "./fakes/providers";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const env = parseEnv({
  DATABASE_URL: "postgres://x@localhost/x",
  APP_URL: "https://cal.example.com",
  AUTH_SECRET: "x".repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  SMTP_HOST: "localhost",
  SMTP_FROM: "t@x.test",
  GOOGLE_CLIENT_ID: "gid",
  GOOGLE_CLIENT_SECRET: "gsecret",
  ZOOM_CLIENT_ID: "zid",
  ZOOM_CLIENT_SECRET: "zsecret",
});

const MIN = 60_000;
const NOW = Date.parse("2026-10-01T08:00:00Z");
const MONDAY = { start: Date.parse("2026-10-05T00:00:00Z"), end: Date.parse("2026-10-06T00:00:00Z") };

let google: ReturnType<typeof createFakeGoogle>;
let zoomApi: ReturnType<typeof createFakeZoom>;
let now = NOW;
let invalidNotices: string[] = [];

function deps(): IntegrationDeps {
  return {
    db,
    env,
    cipher: createCipher({ current: env.ENCRYPTION_KEY }),
    fetchFor: (p) => (p.id === "zoom" ? zoomApi.fetch : google.fetch),
    now: () => now,
    onCredentialInvalid: async ({ label }) => {
      invalidNotices.push(label);
    },
  };
}

const googlePayload = (expiresAt = NOW + 3_600_000) => ({ accessToken: "at", refreshToken: "rt", expiresAt });

async function setup(locations: { kind: string; value: string | null }[] = []) {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "booking", "schedule", "event_type", "credential" CASCADE`);
  google = createFakeGoogle();
  zoomApi = createFakeZoom();
  now = NOW;
  invalidNotices = [];
  await db.insert(user).values({ id: "h1", name: "Hana", email: "hana@example.com", username: "hana", emailVerified: true, timeZone: "UTC" });
  await ensureDefaultSchedule(db, "h1", "UTC");
  await createEventType(
    db,
    "h1",
    eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title: "Intro", slug: "intro", minNoticeMinutes: 0, locations }),
  );
  const host = (await findPublicHost(db, "hana"))!;
  const eventType = (await findPublicEventType(db, host.id, "intro"))!;
  const credentialId = await connectAccount(deps(), { userId: "h1", provider: getProvider("google"), label: "hana@example.com", payload: googlePayload() });
  return { host, eventType, credentialId };
}

const busyFn = (host: { id: string; timeZone: string }, eventTypeId: string) => async (window: { start: number; end: number }) =>
  (await getExternalBusy(deps(), { userId: host.id, eventTypeId, window, timeZone: host.timeZone })).busy;

const book = (s: Awaited<ReturnType<typeof setup>>, start: number, extra: Partial<Parameters<typeof createBooking>[1]> = {}) =>
  createBooking(db, {
    host: s.host,
    eventType: s.eventType,
    start,
    durationMin: 30,
    booker: { name: "Grace", email: "grace@example.com", timeZone: "UTC", locale: "en" },
    guests: [],
    now,
    externalBusy: busyFn(s.host, s.eventType.id),
    ...extra,
  });

describe("connecting accounts (INT-006, INT-007)", () => {
  beforeEach(() => resetDatabase(db));

  it("stores an encrypted credential, lists calendars and picks defaults", async () => {
    const { credentialId } = await setup();
    const [row] = await db.select().from(credential).where(eq(credential.id, credentialId));
    expect(row.encryptedPayload).not.toContain("rt"); // tokens never stored in clear
    const [conn] = await listConnections(db, "h1");
    expect(conn).toMatchObject({ provider: "google", label: "hana@example.com", invalid: false });
    expect(conn.calendars.map((c) => [c.name, c.readOnly, c.checkConflicts, c.isDestination])).toEqual([
      ["Hana", false, true, true],
      ["Team", true, false, false],
    ]);
  });

  it("reconnecting the same account keeps settings and clears errors", async () => {
    const { credentialId } = await setup();
    const team = (await listConnections(db, "h1"))[0].calendars.find((c) => c.name === "Team")!;
    await setConflictCheck(db, "h1", team.id, true);
    await db.update(credential).set({ invalidAt: new Date(), lastError: "x" });
    const again = await connectAccount(deps(), { userId: "h1", provider: getProvider("google"), label: "hana@example.com", payload: googlePayload() });
    expect(again).toBe(credentialId);
    const [conn] = await listConnections(db, "h1");
    expect(conn.invalid).toBe(false);
    expect(conn.calendars.find((c) => c.name === "Team")?.checkConflicts).toBe(true);
  });

  it("a failed reconnect leaves the working credential untouched", async () => {
    const { credentialId } = await setup();
    const [before] = await db.select().from(credential).where(eq(credential.id, credentialId));
    google.revoke();
    await expect(
      connectAccount(deps(), { userId: "h1", provider: getProvider("google"), label: "hana@example.com", payload: googlePayload() }),
    ).rejects.toMatchObject({ kind: "auth" });
    const [after] = await db.select().from(credential).where(eq(credential.id, credentialId));
    expect(after.encryptedPayload).toBe(before.encryptedPayload);
    expect(after.invalidAt).toBeNull();
    expect((await listConnections(db, "h1"))[0].calendars).toHaveLength(2);
  });

  it("concurrent connects of the same account yield one credential", async () => {
    await setup();
    const ids = await Promise.all(
      [1, 2, 3].map(() => connectAccount(deps(), { userId: "h1", provider: getProvider("google"), label: "hana@example.com", payload: googlePayload() })),
    );
    expect(new Set(ids).size).toBe(1);
    expect(await db.select().from(credential)).toHaveLength(1);
  });

  it("an empty calendar list from the provider does not wipe connected calendars", async () => {
    const { credentialId } = await setup();
    const empty: typeof google.fetch = async (url, init) =>
      new URL(url).pathname.endsWith("/calendarList") ? new Response(JSON.stringify({ items: [] }), { status: 200 }) : google.fetch(url, init);
    await syncCalendarList({ ...deps(), fetchFor: () => empty }, credentialId);
    expect((await listConnections(db, "h1"))[0].calendars).toHaveLength(2);
  });

  it("refuses read-only destinations and other users' calendars", async () => {
    await setup();
    const team = (await listConnections(db, "h1"))[0].calendars.find((c) => c.name === "Team")!;
    await expect(setDestination(db, "h1", team.id)).rejects.toMatchObject({ code: "READ_ONLY" });
    await db.insert(user).values({ id: "eve", name: "Eve", email: "eve@example.com" });
    await expect(setConflictCheck(db, "eve", team.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(disconnectAccount(db, "eve", (await listConnections(db, "h1"))[0].id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("external busy times (AVL-006, AVL-007)", () => {
  beforeEach(() => resetDatabase(db));

  it("blocks slots that overlap events in conflict calendars", async () => {
    const s = await setup();
    google.addExternal("primary@example.com", "ext1", "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z");
    const slots = await getAvailableSlots(db, { host: s.host, eventType: s.eventType, durationMin: 30, window: MONDAY, now, externalBusy: busyFn(s.host, s.eventType.id) });
    const starts = slots.map((x) => new Date(x.start).toISOString().slice(11, 16));
    expect(starts).not.toContain("10:00");
    expect(starts).not.toContain("10:30");
    expect(starts).toContain("11:00");
    await expect(book(s, Date.parse("2026-10-05T10:00:00Z"))).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE", detail: "external_calendar_busy" });
  });

  it("caches per window and refetches after the TTL", async () => {
    const s = await setup();
    const fn = busyFn(s.host, s.eventType.id);
    await fn(MONDAY);
    await fn(MONDAY);
    await fn({ start: MONDAY.start + 3_600_000, end: MONDAY.start + 7_200_000 }); // inside the cached window
    expect(google.stats.eventsList).toBe(1);
    now += 3 * MIN; // Google TTL is 2 minutes
    await fn(MONDAY);
    expect(google.stats.eventsList).toBe(2);
  });

  it("uses stale data when the provider fails, and fails closed without any", async () => {
    await setup();
    google.addExternal("primary@example.com", "ext1", "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z");
    await getExternalBusy(deps(), { userId: "h1", window: MONDAY, timeZone: "UTC" });
    now += 3 * MIN;
    google.failOnce(503);
    const stale = await getExternalBusy(deps(), { userId: "h1", window: MONDAY, timeZone: "UTC" });
    expect(stale.degraded).toBe(true);
    expect(stale.busy).toHaveLength(1);

    const otherWeek = { start: MONDAY.start + 7 * 86_400_000, end: MONDAY.end + 7 * 86_400_000 };
    google.failOnce(503);
    const closed = await getExternalBusy(deps(), { userId: "h1", window: otherWeek, timeZone: "UTC" });
    expect(closed).toMatchObject({ degraded: true, busy: [{ start: otherWeek.start, end: otherWeek.end }] });
  });

  it("respects per-event-type conflict calendars (INT-006)", async () => {
    const s = await setup();
    const team = (await listConnections(db, "h1"))[0].calendars.find((c) => c.name === "Team")!;
    google.addExternal("team@example.com", "t1", "2026-10-05T09:00:00Z", "2026-10-05T10:00:00Z");
    expect((await getExternalBusy(deps(), { userId: "h1", eventTypeId: s.eventType.id, window: MONDAY, timeZone: "UTC" })).busy).toHaveLength(0);
    await setEventTypeCalendars(db, "h1", s.eventType.id, { conflictCalendarIds: [team.id], destinationCalendarId: null });
    const busy = await getExternalBusy(deps(), { userId: "h1", eventTypeId: s.eventType.id, window: MONDAY, timeZone: "UTC" });
    expect(busy.busy).toEqual([{ start: Date.parse("2026-10-05T09:00:00Z"), end: Date.parse("2026-10-05T10:00:00Z"), ref: "Team" }]);
  });
});

describe("mirroring bookings (INT-007, INT-008, INT-009)", () => {
  beforeEach(() => resetDatabase(db));

  it("creates a Google event with Meet, stores the link, and ignores our own event as busy", async () => {
    const s = await setup([{ kind: "google_meet", value: null }]);
    const created = await book(s, Date.parse("2026-10-05T10:00:00Z"), { location: { kind: "google_meet", value: null } });
    const outcome = await syncCreated(deps(), (await findBookingById(db, created.booking.id))!);
    expect(outcome.failures).toEqual([]);
    expect(outcome.meetingUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    const [b] = await db.select().from(booking).where(eq(booking.id, created.booking.id));
    expect(b.locationValue).toBe(outcome.meetingUrl);
    const gEvents = google.events.get("primary@example.com")!;
    expect(gEvents).toHaveLength(1);
    expect(gEvents[0].id).toBe(googleEventId(`${created.booking.icalUid}@cal.example.com`));

    // Our own event is not an external conflict: the booking itself already blocks the time.
    const busy = await getExternalBusy(deps(), { userId: "h1", window: MONDAY, timeZone: "UTC" });
    expect(busy.busy).toEqual([]);
  });

  it("reschedules by updating the same event, and cancels by deleting it", async () => {
    const s = await setup();
    const first = await book(s, Date.parse("2026-10-05T10:00:00Z"));
    await syncCreated(deps(), (await findBookingById(db, first.booking.id))!);
    const moved = await book(s, Date.parse("2026-10-05T11:00:00Z"), { reschedule: { uid: first.booking.uid, token: first.token } });
    const out = await syncRescheduled(deps(), (await findBookingById(db, moved.booking.id))!, first.booking.id);
    expect(out.failures).toEqual([]);
    expect(google.stats.inserts).toBe(1);
    expect(google.stats.patches).toBe(1);
    expect(google.events.get("primary@example.com")![0].start.dateTime).toBe("2026-10-05T11:00:00.000Z");
    const refs = await db.select().from(bookingReference);
    expect(refs.map((r) => r.bookingId)).toEqual([moved.booking.id]);

    await syncCancelled(deps(), moved.booking.id);
    expect(google.events.get("primary@example.com")).toHaveLength(0);
    expect(await db.select().from(bookingReference)).toHaveLength(0);
  });

  it("creates a Zoom meeting and puts its link in the calendar event", async () => {
    const s = await setup([{ kind: "zoom", value: null }]);
    // Zoom connects like any OAuth account; it just has no calendars.
    await connectAccount(deps(), { userId: "h1", provider: getProvider("zoom"), label: "hana@zoom", payload: googlePayload() });
    const created = await book(s, Date.parse("2026-10-05T10:00:00Z"), { location: { kind: "zoom", value: null } });
    const outcome = await syncCreated(deps(), (await findBookingById(db, created.booking.id))!);
    expect(outcome.meetingUrl).toMatch(/^https:\/\/zoom\.us\/j\/\d+$/);
    expect(zoomApi.meetings.size).toBe(1);
    expect(google.events.get("primary@example.com")![0]).toMatchObject({ location: outcome.meetingUrl });
    await syncCancelled(deps(), created.booking.id);
    expect(zoomApi.meetings.size).toBe(0);
  });

  it("records failures without undoing the booking, and Meet without a Google destination is reported", async () => {
    const s = await setup([{ kind: "ms_teams", value: null }]);
    const created = await book(s, Date.parse("2026-10-05T10:00:00Z"), { location: { kind: "ms_teams", value: null } });
    const outcome = await syncCreated(deps(), (await findBookingById(db, created.booking.id))!);
    expect(outcome.failures.join()).toMatch(/Teams needs a Microsoft destination calendar/);
    const [b] = await db.select().from(booking).where(eq(booking.id, created.booking.id));
    expect(b.status).toBe("accepted");
  });
});

describe("booking.process job (retries, cancellation races)", () => {
  beforeEach(() => resetDatabase(db));

  const handler = (sent: { to: string; id: string }[]) =>
    createBookingProcessHandler({
      db,
      cipher: createCipher({ current: env.ENCRYPTION_KEY }),
      appUrl: env.APP_URL,
      authSecret: env.AUTH_SECRET,
      integrations: deps(),
      enqueueEmail: async (email, id) => {
        sent.push({ to: email.to, id });
      },
      enqueueJob: async () => undefined,
    });
  const job = (bookingId: string, retryCount = 0, event: "created" | "cancelled" = "created") => ({
    id: `job-${bookingId}-${retryCount}`,
    data: { event, bookingId },
    retryCount,
    retryLimit: 5,
  });

  it("does not create events or send emails for a booking cancelled before the job ran", async () => {
    const s = await setup();
    const created = await book(s, Date.parse("2026-10-05T10:00:00Z"));
    await cancelBySystem(db, { bookingId: created.booking.id, reason: "test", now });
    const sent: { to: string; id: string }[] = [];
    await handler(sent)([job(created.booking.id)]);
    expect(google.stats.inserts).toBe(0);
    expect(sent).toEqual([]);
  });

  it("removes what it created when the booking is cancelled while the sync runs", async () => {
    const s = await setup();
    const created = await book(s, Date.parse("2026-10-05T10:00:00Z"));
    const slowFetch: typeof google.fetch = async (url, init) => {
      const res = await google.fetch(url, init);
      if ((init?.method ?? "GET") === "POST") await cancelBySystem(db, { bookingId: created.booking.id, reason: "race", now });
      return res;
    };
    const sent: { to: string; id: string }[] = [];
    await createBookingProcessHandler({
      db,
      cipher: createCipher({ current: env.ENCRYPTION_KEY }),
      appUrl: env.APP_URL,
      authSecret: env.AUTH_SECRET,
      integrations: { ...deps(), fetchFor: () => slowFetch },
      enqueueEmail: async (email, id) => {
        sent.push({ to: email.to, id });
      },
      enqueueJob: async () => undefined,
    })([job(created.booking.id)]);
    expect(google.events.get("primary@example.com")).toHaveLength(0);
    expect(await db.select().from(bookingReference)).toHaveLength(0);
    expect(sent).toEqual([]);
  });

  it("retries transient failures without duplicating events, then emails once", async () => {
    const s = await setup();
    const created = await book(s, Date.parse("2026-10-05T10:00:00Z"));
    const sent: { to: string; id: string }[] = [];
    google.failOnce(503);
    await expect(handler(sent)([job(created.booking.id, 0)])).rejects.toBeInstanceOf(RetrySyncError);
    expect(sent).toEqual([]);
    const [failed] = await db.select().from(bookingReference);
    expect(failed).toMatchObject({ status: "failed", attempts: 1 });

    await handler(sent)([job(created.booking.id, 1)]);
    await handler(sent)([job(created.booking.id, 2)]); // a duplicate delivery is harmless
    expect(google.events.get("primary@example.com")).toHaveLength(1);
    const refs = await db.select().from(bookingReference);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ status: "synced", attempts: 2 });
    // Same deterministic job ids both times: pg-boss drops the duplicates.
    expect(new Set(sent.map((e) => e.id)).size).toBe(sent.length / 2);
    expect(sent[0].id).toBe(stableJobId(`${created.booking.id}:created:booking-scheduled:${sent[0].to}:0`));
  });

  it("sends emails on the last attempt even if the calendar is still failing", async () => {
    const s = await setup();
    const created = await book(s, Date.parse("2026-10-05T10:00:00Z"));
    const sent: { to: string; id: string }[] = [];
    google.failOnce(503);
    await handler(sent)([job(created.booking.id, 5)]);
    expect(sent.length).toBeGreaterThan(0);
    const [ref] = await db.select().from(bookingReference);
    expect(ref.status).toBe("failed");
  });

  it("a chained reschedule whose middle job was skipped still moves the original event", async () => {
    const s = await setup();
    const a = await book(s, Date.parse("2026-10-05T10:00:00Z"));
    await syncCreated(deps(), (await findBookingById(db, a.booking.id))!);
    const b = await book(s, Date.parse("2026-10-05T11:00:00Z"), { reschedule: { uid: a.booking.uid, token: a.token } });
    const c = await book(s, Date.parse("2026-10-05T13:00:00Z"), { reschedule: { uid: b.booking.uid, token: b.token } });
    const sent: { to: string; id: string }[] = [];
    await handler(sent)([{ id: "jb", data: { event: "rescheduled", bookingId: b.booking.id, previousBookingId: a.booking.id }, retryCount: 0, retryLimit: 5 }]);
    expect(sent).toEqual([]); // B is no longer active
    const out = await syncRescheduled(deps(), (await findBookingById(db, c.booking.id))!, b.booking.id);
    expect(out.failures).toEqual([]);
    expect(google.stats.inserts).toBe(1);
    expect(google.events.get("primary@example.com")!.map((e) => e.start.dateTime)).toEqual(["2026-10-05T13:00:00.000Z"]);
    expect((await db.select().from(bookingReference)).map((r) => r.bookingId)).toEqual([c.booking.id]);
  });

  it("a reschedule creates the event that failed to be created for the original booking", async () => {
    const s = await setup();
    const a = await book(s, Date.parse("2026-10-05T10:00:00Z"));
    google.failOnce(400);
    await syncCreated(deps(), (await findBookingById(db, a.booking.id))!);
    expect(google.events.get("primary@example.com")).toHaveLength(0);
    const b = await book(s, Date.parse("2026-10-05T11:00:00Z"), { reschedule: { uid: a.booking.uid, token: a.token } });
    const out = await syncRescheduled(deps(), (await findBookingById(db, b.booking.id))!, a.booking.id);
    expect(out.failures).toEqual([]);
    expect(google.events.get("primary@example.com")!.map((e) => e.start.dateTime)).toEqual(["2026-10-05T11:00:00.000Z"]);
    const refs = await db.select().from(bookingReference);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ bookingId: b.booking.id, status: "synced" });
  });

  it("a retried reschedule keeps updating the moved references instead of creating new events", async () => {
    const s = await setup();
    const first = await book(s, Date.parse("2026-10-05T10:00:00Z"));
    await syncCreated(deps(), (await findBookingById(db, first.booking.id))!);
    const moved = await book(s, Date.parse("2026-10-05T11:00:00Z"), { reschedule: { uid: first.booking.uid, token: first.token } });
    google.failOnce(503);
    const failed = await syncRescheduled(deps(), (await findBookingById(db, moved.booking.id))!, first.booking.id);
    expect(failed.retryable).toBe(true);
    const again = await syncRescheduled(deps(), (await findBookingById(db, moved.booking.id))!, first.booking.id);
    expect(again.failures).toEqual([]);
    expect(google.stats.inserts).toBe(1);
    expect(google.events.get("primary@example.com")![0].start.dateTime).toBe("2026-10-05T11:00:00.000Z");
  });
});

describe("credential health (INT-012)", () => {
  beforeEach(() => resetDatabase(db));

  it("refreshes an expiring token once, even with concurrent callers", async () => {
    const { credentialId } = await setup();
    const d = deps();
    // Expire the stored token.
    const [row] = await db.select().from(credential).where(eq(credential.id, credentialId));
    await db
      .update(credential)
      .set({ encryptedPayload: d.cipher.encrypt(JSON.stringify(googlePayload(NOW - 1)), row.id) })
      .where(eq(credential.id, credentialId));
    const tokens = await Promise.all(
      Array.from({ length: 5 }, () => withCredential(d, credentialId, async (ctx) => (ctx.credential as { accessToken: string }).accessToken)),
    );
    expect(google.stats.tokenRefresh).toBe(1);
    expect(new Set(tokens)).toEqual(new Set(["fresh-1"]));
  });

  it("marks revoked credentials invalid, notifies once, and keeps bookings working", async () => {
    const s = await setup();
    google.revoke();
    now += 3 * MIN;
    const first = await getExternalBusy(deps(), { userId: "h1", window: MONDAY, timeZone: "UTC" });
    expect(first.degraded).toBe(true);
    await getExternalBusy(deps(), { userId: "h1", window: { start: MONDAY.start + 86_400_000, end: MONDAY.end + 86_400_000 }, timeZone: "UTC" });
    expect(invalidNotices).toEqual(["hana@example.com"]); // once
    expect((await listConnections(db, "h1"))[0].invalid).toBe(true);
    // Invalid calendars are skipped, so the host stays bookable and sync failures are recorded.
    const created = await book(s, Date.parse("2026-10-05T10:00:00Z"));
    expect(created.booking.status).toBe("accepted");
    const outcome = await syncCreated(deps(), (await findBookingById(db, created.booking.id))!);
    expect(outcome.failures).toEqual([]); // no usable destination: nothing attempted
  });
});
