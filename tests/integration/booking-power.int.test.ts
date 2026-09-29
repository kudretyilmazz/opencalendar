import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { attendee, booking, bookingHost, user } from "@/db/schema";
import { acceptBooking, cancelSeat, rejectBooking, setNoShow } from "@/features/bookings/server/decisions";
import { explainDay } from "@/features/bookings/server/explain";
import {
  BookingFailure,
  cancelByAttendee,
  cancelSeriesByAttendee,
  createBooking,
  findBookingForManage,
  getAvailableSlots,
} from "@/features/bookings/server/service";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import { createPrivateLink } from "@/features/event-types/server/private-links";
import { createEventType, findPublicEventType, findPublicHost } from "@/features/event-types/server/service";
import { createWorkflow, listWorkflows, updateWorkflow } from "@/features/workflows/server/service";
import { DEFAULT_REMINDER } from "@/features/workflows/schemas";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { createCipher } from "@/lib/crypto/encryption";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const MIN = 60_000;
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-01T08:00:00Z"); // Thursday
const MON_10 = Date.parse("2026-10-05T10:00:00Z");
const cipher = createCipher({ current: Buffer.alloc(32, 7).toString("base64") });
const booker = (n = 1) => ({ name: `Booker ${n}`, email: `b${n}@example.com`, timeZone: "UTC", locale: "en" });

async function setup(patch: Record<string, unknown> = {}) {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "booking", "schedule", "event_type", "slot_reservation", "workflow", "private_link" CASCADE`);
  await db.insert(user).values({ id: "host1", name: "Ada", email: "ada@example.com", username: "ada", emailVerified: true, timeZone: "UTC" });
  await ensureDefaultSchedule(db, "host1", "UTC");
  const id = await createEventType(
    db,
    "host1",
    eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title: "Intro", slug: "intro", minNoticeMinutes: 0, ...patch }),
    { defaultReminder: true },
  );
  const host = (await findPublicHost(db, "ada"))!;
  const eventType = (await findPublicEventType(db, host.id, "intro"))!;
  return { host, eventType, id, input: { host, eventType, start: MON_10, durationMin: 30, booker: booker(), guests: [] as string[], now: NOW } };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof BookingFailure) return e.detail ? `${e.code}:${e.detail}` : e.code;
    throw e;
  }
};

describe("event type settings (EVT-009, NTF-006)", () => {
  beforeEach(() => resetDatabase(db));

  it("stores questions in order and gives new event types the default 24 h reminder", async () => {
    const { eventType, id } = await setup({
      questions: [
        { key: "company", type: "short_text", label: "Company", placeholder: null, required: true, hidden: false, options: [] },
        { key: "size", type: "select", label: "Size", placeholder: null, required: false, hidden: false, options: ["1-10", "11+", ""] },
      ],
    });
    expect(eventType.questions.map((q) => [q.key, q.options])).toEqual([
      ["company", []],
      ["size", ["1-10", "11+"]],
    ]);
    const workflows = await listWorkflows(db, "host1", id);
    expect(workflows).toMatchObject([{ trigger: "before_start", offsetMinutes: 1440, recipient: "attendees", isDefault: true }]);
  });

  it("keeps answers, UTM and a custom event name on the booking", async () => {
    const { input } = await setup({ eventNameTemplate: "{event} · {attendee}" });
    const created = await createBooking(db, { ...input, responses: { company: "ACME" }, utm: { utm_source: "news" }, source: "embed" });
    expect(created.booking).toMatchObject({ title: "Intro · Booker 1", responses: { company: "ACME" }, utm: { utm_source: "news" }, source: "embed" });
  });
});

describe("requires confirmation (EVT-011, BKG-012)", () => {
  beforeEach(() => resetDatabase(db));

  it("creates pending bookings that block time; accept keeps it, reject releases it", async () => {
    const { host, eventType, input } = await setup({ requiresConfirmation: true });
    const first = await createBooking(db, input);
    expect(first.booking.status).toBe("pending");
    expect(await code(createBooking(db, { ...input, booker: booker(2) }))).toMatch(/^SLOT_UNAVAILABLE/);

    let committed = "";
    const accepted = await acceptBooking(db, { bookingId: first.booking.id, hostId: "host1", now: NOW, onCommit: async (_tx, row) => void (committed = row.status) });
    expect(accepted.status).toBe("accepted");
    expect(committed).toBe("accepted");
    expect(await code(acceptBooking(db, { bookingId: first.booking.id, hostId: "host1", now: NOW }))).toBe("NOT_PENDING");

    const second = await createBooking(db, { ...input, start: MON_10 + 60 * MIN, booker: booker(3) });
    expect(await code(rejectBooking(db, { bookingId: second.booking.id, hostId: "intruder", now: NOW }))).toBe("NOT_FOUND");
    const rejected = await rejectBooking(db, { bookingId: second.booking.id, hostId: "host1", reason: "Busy", now: NOW });
    expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "Busy" });
    const [hostRow] = await db.select().from(bookingHost).where(eq(bookingHost.bookingId, second.booking.id));
    expect(hostRow.active).toBe(false);
    const window = { start: MON_10 - 2 * 60 * MIN, end: MON_10 + 8 * 60 * MIN };
    const slots = await getAvailableSlots(db, { host, eventType, durationMin: 30, window, now: NOW });
    expect(slots.some((s) => s.start === MON_10 + 60 * MIN)).toBe(true);
  });

  it("keeps the manage token sealed until the decision and hands it to the acceptance", async () => {
    const { input } = await setup({ requiresConfirmation: true });
    const created = await createBooking(db, input);
    const sealed = cipher.encrypt(created.token, created.booking.id);
    await db.update(booking).set({ pendingTokenSealed: sealed }).where(eq(booking.id, created.booking.id));
    let handed: string | null = null;
    await acceptBooking(db, { bookingId: created.booking.id, hostId: "host1", now: NOW, onCommit: async (_tx, row) => void (handed = row.pendingTokenSealed) });
    expect(handed && cipher.decrypt(handed, created.booking.id)).toBe(created.token);
    const [after] = await db.select().from(booking).where(eq(booking.id, created.booking.id));
    expect(after.pendingTokenSealed).toBeNull();
  });

  it("won't accept a request whose time has passed", async () => {
    const { input } = await setup({ requiresConfirmation: true });
    const created = await createBooking(db, input);
    expect(await code(acceptBooking(db, { bookingId: created.booking.id, hostId: "host1", now: MON_10 + MIN }))).toBe("IN_PAST");
  });

  it("only requires confirmation within the threshold", async () => {
    const { input } = await setup({ requiresConfirmation: true, confirmationThresholdMinutes: 24 * 60 });
    expect((await createBooking(db, input)).booking.status).toBe("accepted"); // 4 days ahead
    expect((await createBooking(db, { ...input, start: Date.parse("2026-10-01T14:00:00Z"), booker: booker(2) })).booking.status).toBe("pending");
  });
});

describe("seats (EVT-012)", () => {
  beforeEach(() => resetDatabase(db));

  it("fills one booking seat by seat, each seat managing only itself", async () => {
    const { host, eventType, input } = await setup({ seatsPerSlot: 2 });
    const a = await createBooking(db, { ...input, notes: "seat one only", responses: { x: "1" } });
    const b = await createBooking(db, { ...input, booker: booker(2), idempotencyKey: undefined, notes: "seat two only" });
    // The shared booking row carries no one's notes or answers; each seat keeps its own.
    expect(a.booking).toMatchObject({ notes: null, responses: {} });
    expect([a.seat?.notes, b.seat?.notes]).toEqual(["seat one only", "seat two only"]);
    expect(b.joined).toBe(true);
    expect(b.booking.id).toBe(a.booking.id);
    expect(a.booking.title).toBe("Intro with Ada"); // no attendee name in a shared title
    expect(await code(createBooking(db, { ...input, booker: booker(3) }))).toMatch(/SLOT_UNAVAILABLE:seats_full/);
    expect(await code(createBooking(db, { ...input, booker: booker(4), guests: ["x@example.com"] }))).toBe("TOO_MANY_GUESTS");

    // Seat tokens don't grant booking-level management.
    const manage = await findBookingForManage(db, a.booking.uid, b.token);
    expect(manage?.canManage).toBe(false);
    expect(manage?.seat?.email).toBe("b2@example.com");

    const first = await cancelSeat(db, { uid: a.booking.uid, token: b.token, now: NOW });
    expect(first.bookingCancelled).toBe(false);
    const window = { start: MON_10 - DAY / 4, end: MON_10 + DAY / 4 };
    const slots = await getAvailableSlots(db, { host, eventType, durationMin: 30, window, now: NOW });
    expect(slots.find((s) => s.start === MON_10)?.seatsRemaining).toBe(1);
    const last = await cancelSeat(db, { uid: a.booking.uid, token: a.token, now: NOW });
    expect(last.bookingCancelled).toBe(true);
    expect(last.booking.status).toBe("cancelled");
  });
});

describe("recurring bookings (EVT-013)", () => {
  beforeEach(() => resetDatabase(db));

  it("books the whole series atomically and cancels the remaining occurrences", async () => {
    const { input } = await setup({ recurringFrequency: "weekly", recurringMaxCount: 4 });
    const created = await createBooking(db, { ...input, recurringCount: 3 });
    expect(created.series?.map((r) => r.startAt.toISOString())).toEqual(["2026-10-05T10:00:00.000Z", "2026-10-12T10:00:00.000Z", "2026-10-19T10:00:00.000Z"]);
    expect(new Set(created.series?.map((r) => r.recurringSeriesId)).size).toBe(1);
    expect(await code(createBooking(db, { ...input, recurringCount: 5, booker: booker(2) }))).toBe("INVALID_RECURRENCE");

    // A conflict on any occurrence fails the whole series.
    expect(await code(createBooking(db, { ...input, start: MON_10 - 7 * DAY + 7 * DAY + 7 * DAY, recurringCount: 2, booker: booker(3) }))).toMatch(/^SLOT_UNAVAILABLE/);

    const cancelled = await cancelSeriesByAttendee(db, { uid: created.booking.uid, token: created.token, now: NOW });
    expect(cancelled).toHaveLength(3);
    const rows = await db.select().from(booking).where(eq(booking.recurringSeriesId, created.booking.recurringSeriesId!));
    expect(rows.every((r) => r.status === "cancelled")).toBe(true);
  });
});

describe("limits, private links and policies (EVT-010, EVT-015, EVT-017)", () => {
  beforeEach(() => resetDatabase(db));

  it("enforces booking limits per day", async () => {
    const { input } = await setup({ bookingLimits: { day: 1 } });
    await createBooking(db, input);
    expect(await code(createBooking(db, { ...input, start: MON_10 + 2 * 60 * MIN, booker: booker(2) }))).toBe("SLOT_UNAVAILABLE:limit_reached");
    expect(await code(createBooking(db, { ...input, start: MON_10 + DAY, booker: booker(3) }))).toBe("OK");
  });

  it("link-only event types need an unused, unexpired single-use link", async () => {
    const { eventType, input } = await setup({ linkOnly: true });
    const token = await createPrivateLink(db, cipher, "host1", eventType.id, null);
    const expired = await createPrivateLink(db, cipher, "host1", eventType.id, new Date(NOW - 1000));
    expect(await code(createBooking(db, input))).toBe("LINK_INVALID");
    expect(await code(createBooking(db, { ...input, privateLinkToken: expired }))).toBe("LINK_INVALID");
    expect(await code(createBooking(db, { ...input, privateLinkToken: token }))).toBe("OK");
    expect(await code(createBooking(db, { ...input, start: MON_10 + 60 * MIN, booker: booker(2), privateLinkToken: token }))).toBe("LINK_INVALID");
  });

  it("respects disabled self-service and the cancellation cutoff", async () => {
    const { input } = await setup({ cancelCutoffMinutes: 24 * 60 });
    const soon = await createBooking(db, { ...input, start: Date.parse("2026-10-01T14:00:00Z") });
    expect(await code(cancelByAttendee(db, { uid: soon.booking.uid, token: soon.token, now: NOW }))).toBe("NOT_ALLOWED");
    expect(await code(createBooking(db, { ...input, start: MON_10 + 60 * MIN, reschedule: { uid: soon.booking.uid, token: soon.token } }))).toBe("NOT_ALLOWED");
    const later = await createBooking(db, { ...input, booker: booker(2) });
    expect(await code(cancelByAttendee(db, { uid: later.booking.uid, token: later.token, now: NOW }))).toBe("OK");
  });

  it("no-show marks only after the start, host-owned only", async () => {
    const { input } = await setup();
    const created = await createBooking(db, input);
    const seat = created.attendees[0];
    expect(await code(setNoShow(db, { bookingId: created.booking.id, hostId: "host1", target: "host", noShow: true, now: NOW }))).toBe("NOT_ALLOWED");
    const after = MON_10 + 40 * MIN;
    expect(await code(setNoShow(db, { bookingId: created.booking.id, hostId: "other", target: "host", noShow: true, now: after }))).toBe("NOT_FOUND");
    await setNoShow(db, { bookingId: created.booking.id, hostId: "host1", target: { attendeeId: seat.id }, noShow: true, now: after });
    await setNoShow(db, { bookingId: created.booking.id, hostId: "host1", target: "host", noShow: true, now: after });
    const [a] = await db.select().from(attendee).where(eq(attendee.id, seat.id));
    const [b] = await db.select().from(booking).where(eq(booking.id, created.booking.id));
    expect([a.noShow, b.hostNoShow]).toEqual([true, true]);
  });
});

describe("troubleshooter (AVL-008)", () => {
  beforeEach(() => resetDatabase(db));

  it("explains each candidate slot with a reason and source", async () => {
    const { host, eventType, input } = await setup();
    await createBooking(db, input);
    const result = await explainDay(db, { host, eventType, date: "2026-10-05", now: NOW, externalBusy: async () => [{ start: MON_10 + 60 * MIN, end: MON_10 + 90 * MIN, ref: "Work calendar" }] });
    const at = (ms: number) => result.slots.find((s) => s.start === ms);
    expect(at(MON_10)).toMatchObject({ status: "booking_conflict", source: "Intro between Ada and Booker 1" });
    expect(at(MON_10 + 60 * MIN)).toMatchObject({ status: "external_calendar_busy", source: "Work calendar" });
    expect(at(MON_10 + 120 * MIN)?.status).toBe("available");
    expect(at(Date.parse("2026-10-05T03:00:00Z"))?.status).toBe("outside_working_hours");
  });
});

describe("booking.process for M3 events (NTF-004/005, API-001)", () => {
  beforeEach(() => resetDatabase(db));

  const env = { appUrl: "https://cal.example.com", secret: "s".repeat(32) };
  const run = async (data: Record<string, unknown>) => {
    const { createBookingProcessHandler } = await import("@/jobs/booking-process");
    const emails: { to: string; template: string; props: Record<string, unknown> }[] = [];
    const jobs: { key: string; payload: Record<string, unknown>; startAfter?: Date }[] = [];
    const integrations = { db, env: { APP_URL: env.appUrl }, cipher, fetchFor: () => fetch, now: () => NOW, onCredentialInvalid: async () => undefined } as never;
    await createBookingProcessHandler({
      db,
      cipher,
      appUrl: env.appUrl,
      authSecret: env.secret,
      integrations,
      now: () => NOW,
      enqueueEmail: async (email) => void emails.push(email as never),
      enqueueJob: async (key, payload, options) => void jobs.push({ key, payload: payload as never, startAfter: options.startAfter }),
    })([{ id: "j1", data, retryCount: 0, retryLimit: 5 }]);
    return { emails, jobs };
  };

  it("a request emails decision links to the host, and acceptance schedules reminders and the end-of-meeting job", async () => {
    const { input } = await setup({ requiresConfirmation: true });
    const created = await createBooking(db, input);
    const requested = await run({ bookingId: created.booking.id, event: "requested", sealedToken: cipher.encrypt(created.token) });
    const hostMail = requested.emails.find((e) => e.to === "ada@example.com")!;
    expect(hostMail.template).toBe("booking-requested");
    expect(String(hostMail.props.acceptUrl)).toMatch(/\/booking\/[^/]+\/decide\?action=accept&exp=\d+&sig=/);
    expect(requested.jobs.map((j) => j.key)).toEqual([]); // nothing until confirmed

    await acceptBooking(db, { bookingId: created.booking.id, hostId: "host1", now: NOW });
    const accepted = await run({ bookingId: created.booking.id, event: "accepted" });
    expect(accepted.emails.map((e) => e.template)).toEqual(["booking-scheduled", "booking-scheduled"]);
    expect(accepted.emails[0].props.accepted).toBe(true);
    const keys = accepted.jobs.map((j) => j.key);
    expect(keys).toContain("workflowRun");
    expect(keys).toContain("bookingEnded");
    expect(accepted.jobs.find((j) => j.key === "workflowRun")?.startAfter?.toISOString()).toBe("2026-10-04T10:00:00.000Z");
  });

  it("the workflow step is dropped when the booking moved or was cancelled, and sent otherwise", async () => {
    const { input, id } = await setup();
    const created = await createBooking(db, input);
    const [reminder] = await listWorkflows(db, "host1", id);
    const { createWorkflowRunHandler } = await import("@/jobs/workflow-run");
    const sent: { to: string; props: Record<string, unknown> }[] = [];
    const handler = createWorkflowRunHandler({ db, appUrl: env.appUrl, enqueueEmail: async (e) => void sent.push(e as never) });
    await handler([{ id: "w-stale", data: { workflowId: reminder.id, bookingId: created.booking.id, expectedStart: MON_10 + 60 * MIN } }]);
    expect(sent).toEqual([]);
    await handler([{ id: "w-ok", data: { workflowId: reminder.id, bookingId: created.booking.id, expectedStart: MON_10 } }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "b1@example.com", props: { subject: "Reminder: Intro between Ada and Booker 1 on Monday, October 5, 2026" } });
    await cancelByAttendee(db, { uid: created.booking.uid, token: created.token, now: NOW });
    await handler([{ id: "w-cancelled", data: { workflowId: reminder.id, bookingId: created.booking.id, expectedStart: MON_10 } }]);
    expect(sent).toHaveLength(1);
  });

  it("the booker's reminder carries working cancel/reschedule links; hosts get the dashboard (NTF-005)", async () => {
    const { input, id } = await setup();
    const created = await createBooking(db, input);
    await db.update(booking).set({ manageTokenSealed: cipher.encrypt(created.token, created.booking.id) }).where(eq(booking.id, created.booking.id));
    const [reminder] = await listWorkflows(db, "host1", id);
    await updateWorkflow(db, "host1", reminder.id, { ...DEFAULT_REMINDER, body: "cancel {cancel_url} move {reschedule_url}" });
    await createWorkflow(db, "host1", id, { ...DEFAULT_REMINDER, name: "Host copy", recipient: "host", body: "cancel {cancel_url}" });
    const { createWorkflowRunHandler } = await import("@/jobs/workflow-run");
    const sent: { to: string; props: { body: string } }[] = [];
    const handler = createWorkflowRunHandler({ db, appUrl: env.appUrl, cipher, enqueueEmail: async (e) => void sent.push(e as never) });
    for (const w of await listWorkflows(db, "host1", id)) {
      await handler([{ id: `w-${w.id}`, data: { workflowId: w.id, bookingId: created.booking.id, expectedStart: MON_10 } }]);
    }
    const token = encodeURIComponent(created.token);
    expect(sent.find((e) => e.to === "b1@example.com")!.props.body).toBe(
      `cancel ${env.appUrl}/booking/${created.booking.uid}?token=${token} move ${env.appUrl}/ada/intro?reschedule=${created.booking.uid}&token=${token}`,
    );
    expect(sent.find((e) => e.to === "ada@example.com")!.props.body).toBe(`cancel ${env.appUrl}/bookings`);
  });

  it("seated events: each seat's reminder names only that seat", async () => {
    const { input, id } = await setup({ seatsPerSlot: 3 });
    const a = await createBooking(db, input);
    await createBooking(db, { ...input, booker: booker(2) });
    const [reminder] = await listWorkflows(db, "host1", id);
    const { createWorkflowRunHandler } = await import("@/jobs/workflow-run");
    const sent: { to: string; props: { body: string } }[] = [];
    await createWorkflowRunHandler({ db, appUrl: env.appUrl, enqueueEmail: async (e) => void sent.push(e as never) })([
      { id: "w-seats", data: { workflowId: reminder.id, bookingId: a.booking.id, expectedStart: MON_10 } },
    ]);
    const bodyFor = (to: string) => sent.find((e) => e.to === to)!.props.body;
    expect(bodyFor("b1@example.com")).toContain("Hi Booker 1");
    expect(bodyFor("b2@example.com")).toContain("Hi Booker 2");
    expect(bodyFor("b2@example.com")).not.toContain("Booker 1");
  });
});
