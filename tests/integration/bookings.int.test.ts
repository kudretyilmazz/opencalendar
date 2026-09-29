import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { booking, bookingHost, user } from "@/db/schema";
import { eventTypeFormSchema, DEFAULT_EVENT_TYPE } from "@/features/event-types/schemas";
import { createEventType, findPublicEventType, findPublicHost, getEventType } from "@/features/event-types/server/service";
import {
  BookingFailure,
  cancelByAttendee,
  cancelByHost,
  createBooking,
  findBookingForManage,
  getAvailableSlots,
  holdSlot,
  listHostBookings,
} from "@/features/bookings/server/service";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const MIN = 60_000;
const NOW = Date.parse("2026-10-01T08:00:00Z"); // Thursday
const MONDAY_10 = Date.parse("2026-10-05T10:00:00Z"); // UTC schedule: Mon 10:00
const booker = { name: "Grace", email: "grace@example.com", timeZone: "Europe/Istanbul", locale: "en" };

async function setup(patch: Partial<typeof DEFAULT_EVENT_TYPE> = {}) {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "booking", "schedule", "event_type", "slot_reservation" CASCADE`);
  await db.insert(user).values({ id: "host1", name: "Ada", email: "ada@example.com", username: "ada", emailVerified: true, timeZone: "UTC" });
  await ensureDefaultSchedule(db, "host1", "UTC");
  const id = await createEventType(
    db,
    "host1",
    eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title: "Intro", slug: "intro", minNoticeMinutes: 0, ...patch }),
  );
  const host = (await findPublicHost(db, "ada"))!;
  const eventType = (await findPublicEventType(db, host.id, "intro"))!;
  return { host, eventType, id };
}

const base = async (patch?: Partial<typeof DEFAULT_EVENT_TYPE>) => {
  const { host, eventType } = await setup(patch);
  return {
    host,
    eventType,
    input: { host, eventType, start: MONDAY_10, durationMin: 30, booker, guests: [] as string[], now: NOW },
  };
};

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof BookingFailure) return e.code;
    throw e;
  }
};

describe("slots for the public page", () => {
  beforeEach(() => resetDatabase(db));

  it("returns the default schedule's slots and hides booked ones", async () => {
    const { host, eventType, input } = await base();
    const window = { start: Date.parse("2026-10-05T00:00:00Z"), end: Date.parse("2026-10-06T00:00:00Z") };
    const before = await getAvailableSlots(db, { host, eventType, durationMin: 30, window, now: NOW });
    expect(before).toHaveLength(16);
    await createBooking(db, input);
    const after = await getAvailableSlots(db, { host, eventType, durationMin: 30, window, now: NOW });
    expect(after.map((s) => s.start)).not.toContain(MONDAY_10);
    expect(after).toHaveLength(15);
  });

  it("only publishes hosts with a verified email", async () => {
    await setup();
    await db.update(user).set({ emailVerified: false });
    expect(await findPublicHost(db, "ada")).toBeNull();
  });

  it("rejects durations the event type doesn't offer", async () => {
    const { host, eventType } = await base();
    await expect(
      getAvailableSlots(db, { host, eventType, durationMin: 45, window: { start: NOW, end: NOW + 86_400_000 }, now: NOW }),
    ).rejects.toThrow(BookingFailure);
  });
});

describe("createBooking (BKG-005, NFR-004)", () => {
  it("creates an accepted booking with attendees, a blocking host row and a manage token", async () => {
    const { input } = await base({ bufferAfterMinutes: 10 });
    const created = await createBooking(db, { ...input, guests: ["g@example.com"], notes: "hi" });
    expect(created.booking).toMatchObject({ status: "accepted", sequence: 0, title: "Intro between Ada and Grace" });
    expect(created.booking.uid).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(created.attendees.map((a) => [a.email, a.isGuest])).toEqual([
      ["grace@example.com", false],
      ["g@example.com", true],
    ]);
    const [row] = await db.select().from(bookingHost).where(eq(bookingHost.bookingId, created.booking.id));
    expect(row.blockedEnd.getTime()).toBe(MONDAY_10 + 40 * MIN); // buffer included
    const manage = await findBookingForManage(db, created.booking.uid, created.token);
    expect(manage?.canManage).toBe(true);
    expect((await findBookingForManage(db, created.booking.uid, "wrong"))?.canManage).toBe(false);
  });

  it("50 parallel requests for the same slot produce exactly one booking", async () => {
    const { input } = await base();
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => code(createBooking(db, { ...input, booker: { ...booker, email: `b${i}@example.com` } }))),
    );
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "SLOT_UNAVAILABLE")).toHaveLength(49);
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM booking`)).rows as { n: number }[];
    expect(n).toBe(1);
  });

  it("the exclusion constraint rejects overlaps even when application checks are bypassed", async () => {
    const { input } = await base();
    await createBooking(db, input);
    const second = await createBooking(db, { ...input, start: MONDAY_10 + 120 * MIN });
    // Bypass the service: move the second booking's blocked range onto the first one.
    await expect(
      db
        .update(bookingHost)
        .set({ blockedStart: new Date(MONDAY_10 + 10 * MIN), blockedEnd: new Date(MONDAY_10 + 20 * MIN) })
        .where(eq(bookingHost.bookingId, second.booking.id)),
    ).rejects.toMatchObject({ cause: { code: "23P01" } });
  });

  it("respects buffers between different bookings", async () => {
    const { input } = await base({ bufferBeforeMinutes: 15 });
    await createBooking(db, input); // 10:00–10:30, blocks 09:45–10:30
    // 10:30 needs 10:15–11:00 free, but its own before-buffer falls inside the 10:00 meeting.
    expect(await code(createBooking(db, { ...input, start: MONDAY_10 + 30 * MIN }))).toBe("SLOT_UNAVAILABLE");
    // 09:30 (blocks 09:15–10:00) overlaps the 10:00 booking's before-buffer (09:45–10:00).
    expect(await code(createBooking(db, { ...input, start: MONDAY_10 - 30 * MIN }))).toBe("SLOT_UNAVAILABLE");
    // 11:00 (blocks 10:45–11:30) is clear.
    expect(await code(createBooking(db, { ...input, start: MONDAY_10 + 60 * MIN }))).toBe("OK");
  });

  it("rejects slots the engine would not offer (outside hours, misaligned, past, too many guests)", async () => {
    const { input } = await base();
    expect(await code(createBooking(db, { ...input, start: Date.parse("2026-10-05T20:00:00Z") }))).toBe("SLOT_UNAVAILABLE");
    expect(await code(createBooking(db, { ...input, start: MONDAY_10 + 7 * MIN }))).toBe("SLOT_UNAVAILABLE");
    expect(await code(createBooking(db, { ...input, now: MONDAY_10 + MIN }))).toBe("SLOT_UNAVAILABLE");
    expect(await code(createBooking(db, { ...input, guests: Array.from({ length: 6 }, (_, i) => `g${i}@x.test`) }))).toBe("TOO_MANY_GUESTS");
  });

  it("refuses bookings for a host whose account was disabled meanwhile (deletion in progress)", async () => {
    const { input } = await base();
    await db.update(user).set({ disabledAt: new Date(NOW) }).where(eq(user.id, "host1"));
    expect(await code(createBooking(db, input))).toBe("NOT_FOUND");
  });

  it("rejects implausible start times before reading external calendars", async () => {
    const { input } = await base();
    let reads = 0;
    const externalBusy = async () => {
      reads++;
      return [];
    };
    expect(await code(createBooking(db, { ...input, start: NOW - 60 * MIN, externalBusy }))).toBe("SLOT_UNAVAILABLE");
    expect(await code(createBooking(db, { ...input, start: NOW + 3 * 366 * 24 * 60 * MIN, externalBusy }))).toBe("SLOT_UNAVAILABLE");
    expect(await code(holdSlot(db, { ...input, token: "t".repeat(32), start: MONDAY_10 + 7 * MIN, externalBusy }))).toBe("SLOT_UNAVAILABLE");
    expect(reads).toBe(0);
    // Validation reads use day-aligned windows (shared cache entries).
    const windows: { start: number; end: number }[] = [];
    await createBooking(db, { ...input, externalBusy: async (w) => (windows.push(w), []) });
    expect(windows.every((w) => w.start % 86_400_000 === 0 && w.end % 86_400_000 === 0)).toBe(true);
  });

  it("is idempotent per event type and key", async () => {
    const { input } = await base();
    await createBooking(db, { ...input, idempotencyKey: "k1" });
    expect(await code(createBooking(db, { ...input, start: MONDAY_10 + 60 * MIN, idempotencyKey: "k1" }))).toBe("DUPLICATE");
  });

  it("holds block other sessions but not the holder (BKG-006)", async () => {
    const { host, eventType, input } = await base();
    await holdSlot(db, { host, eventType, start: MONDAY_10, durationMin: 30, token: "holder", now: NOW });
    expect(await code(createBooking(db, { ...input, holdToken: "someone-else" }))).toBe("SLOT_UNAVAILABLE");
    expect(await code(createBooking(db, { ...input, holdToken: "holder" }))).toBe("OK");
  });

  it("the public page's shared host-data cache still hides others' holds but not your own (NFR-001)", async () => {
    const { host, eventType } = await base();
    await holdSlot(db, { host, eventType, start: MONDAY_10, durationMin: 30, token: "holder", now: NOW });
    const window = { start: MONDAY_10 - 60 * MIN, end: MONDAY_10 + 120 * MIN };
    const offered = async (hold: string) =>
      (await getAvailableSlots(db, { host, eventType, durationMin: 30, window, now: NOW, ownHoldToken: hold, displayCache: true })).some((s) => s.start === MONDAY_10);
    expect(await offered("someone-else")).toBe(false);
    expect(await offered("holder")).toBe(true); // same cached data, own hold excluded
  });

  it("rejects holds for slots the engine wouldn't offer and caps live holds per host", async () => {
    const { host, eventType } = await base();
    const hold = (start: number, token: string, durationMin = 30) =>
      code(holdSlot(db, { host, eventType, start, durationMin, token, now: NOW }));
    expect(await hold(MONDAY_10, "t-duration", 5_000_000)).toBe("INVALID_DURATION");
    expect(await hold(Date.parse("2026-10-05T20:00:00Z"), "t-outside")).toBe("SLOT_UNAVAILABLE");
    expect(await hold(MONDAY_10 + 7 * MIN, "t-misaligned")).toBe("SLOT_UNAVAILABLE");
    // 25 distinct offered slots across the week can be held; the 26th is refused.
    const monday9 = Date.parse("2026-10-05T09:00:00Z");
    const starts = Array.from({ length: 26 }, (_, i) => monday9 + Math.floor(i / 16) * 86_400_000 + (i % 16) * 30 * MIN);
    for (const [i, start] of starts.slice(0, 25).entries()) expect(await hold(start, `t-${i}`)).toBe("OK");
    expect(await hold(starts[25], "t-25")).toBe("SLOT_UNAVAILABLE");
  });

  it("expired holds don't block", async () => {
    const { host, eventType, input } = await base();
    await holdSlot(db, { host, eventType, start: MONDAY_10, durationMin: 30, token: "holder", now: NOW - 10 * MIN });
    expect(await code(createBooking(db, input))).toBe("OK");
  });
});

describe("reschedule and cancel (BKG-008, BKG-009)", () => {
  it("reschedules with the manage token, keeping the iCal UID and bumping the sequence", async () => {
    const { input } = await base();
    const first = await createBooking(db, input);
    // The new slot overlaps the old one (10:15 not aligned → use 10:30); overlapping the old slot is fine.
    const moved = await createBooking(db, { ...input, start: MONDAY_10 + 30 * MIN, reschedule: { uid: first.booking.uid, token: first.token } });
    expect(moved.booking).toMatchObject({ icalUid: first.booking.icalUid, sequence: 1, rescheduledFromId: first.booking.id, source: "reschedule" });
    const [old] = await db.select().from(booking).where(eq(booking.id, first.booking.id));
    expect(old).toMatchObject({ status: "cancelled", rescheduled: true });
    // The old slot is free again.
    expect(await code(createBooking(db, { ...input, booker: { ...booker, email: "x@example.com" } }))).toBe("OK");
  });

  it("keeps the guests when rescheduling (BKG-009)", async () => {
    const { input } = await base();
    const first = await createBooking(db, { ...input, guests: ["g1@example.com", "G1@example.com", "grace@example.com"] });
    expect(first.attendees.map((a) => a.email)).toEqual(["grace@example.com", "g1@example.com"]); // deduped, booker removed
    const moved = await createBooking(db, { ...input, start: MONDAY_10 + 60 * MIN, reschedule: { uid: first.booking.uid, token: first.token } });
    expect(moved.attendees.map((a) => [a.email, a.isGuest])).toEqual([
      ["grace@example.com", false],
      ["g1@example.com", true],
    ]);
  });

  it("can reschedule into its own original time", async () => {
    const { input } = await base({ durationMinutes: 60 });
    const first = await createBooking(db, { ...input, durationMin: 60 });
    const moved = await createBooking(db, {
      ...input,
      durationMin: 60,
      start: MONDAY_10,
      reschedule: { uid: first.booking.uid, token: first.token },
    });
    expect(moved.booking.startAt.getTime()).toBe(MONDAY_10);
  });

  it("refuses to reschedule without the right token or after cancellation", async () => {
    const { input } = await base();
    const first = await createBooking(db, input);
    expect(await code(createBooking(db, { ...input, start: MONDAY_10 + 60 * MIN, reschedule: { uid: first.booking.uid, token: "nope" } }))).toBe(
      "RESCHEDULE_NOT_ALLOWED",
    );
    await cancelByAttendee(db, { uid: first.booking.uid, token: first.token, now: NOW });
    expect(
      await code(createBooking(db, { ...input, start: MONDAY_10 + 60 * MIN, reschedule: { uid: first.booking.uid, token: first.token } })),
    ).toBe("RESCHEDULE_NOT_ALLOWED");
  });

  it("attendee cancel requires the token, frees the slot and bumps the sequence", async () => {
    const { input } = await base();
    const first = await createBooking(db, input);
    expect(await code(cancelByAttendee(db, { uid: first.booking.uid, token: "bad", now: NOW }))).toBe("NOT_FOUND");
    const cancelled = await cancelByAttendee(db, { uid: first.booking.uid, token: first.token, reason: "Sick", now: NOW });
    expect(cancelled.booking).toMatchObject({ status: "cancelled", cancelledBy: "attendee", cancellationReason: "Sick", sequence: 1 });
    expect(await code(cancelByAttendee(db, { uid: first.booking.uid, token: first.token, now: NOW }))).toBe("ALREADY_CANCELLED");
    expect(await code(createBooking(db, { ...input, booker: { ...booker, email: "y@example.com" } }))).toBe("OK");
  });

  it("only the organizer can cancel from the dashboard", async () => {
    const { input } = await base();
    const first = await createBooking(db, input);
    await db.insert(user).values({ id: "intruder", name: "Eve", email: "eve@example.com" });
    expect(await code(cancelByHost(db, { hostId: "intruder", bookingId: first.booking.id, now: NOW }))).toBe("NOT_FOUND");
    expect(await code(cancelByHost(db, { hostId: "host1", bookingId: first.booking.id, reason: "Conflict", now: NOW }))).toBe("OK");
  });

  it("does not cancel meetings that already ended", async () => {
    const { input } = await base();
    const first = await createBooking(db, input);
    expect(await code(cancelByAttendee(db, { uid: first.booking.uid, token: first.token, now: MONDAY_10 + 60 * MIN }))).toBe("IN_PAST");
  });
});

describe("host dashboard lists (BKG-010)", () => {
  it("splits bookings into upcoming, past and cancelled tabs and filters by event type", async () => {
    const { input, eventType } = await base();
    const a = await createBooking(db, input);
    await createBooking(db, { ...input, start: MONDAY_10 + 60 * MIN });
    await cancelByAttendee(db, { uid: a.booking.uid, token: a.token, now: NOW });
    const upcoming = await listHostBookings(db, "host1", { tab: "upcoming", now: NOW });
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].attendees[0].email).toBe("grace@example.com");
    expect(await listHostBookings(db, "host1", { tab: "cancelled", now: NOW })).toHaveLength(1);
    expect(await listHostBookings(db, "host1", { tab: "past", now: MONDAY_10 + 24 * 3_600_000 })).toHaveLength(1);
    expect(await listHostBookings(db, "host1", { tab: "upcoming", now: NOW, eventTypeId: "other" })).toHaveLength(0);
    expect(await listHostBookings(db, "host1", { tab: "upcoming", now: NOW, eventTypeId: eventType.id })).toHaveLength(1);
    expect(await listHostBookings(db, "someone-else", { tab: "upcoming", now: NOW })).toHaveLength(0);
  });

  it("owner-scoped event type access", async () => {
    const { id } = await setup();
    expect(await getEventType(db, "host1", id)).not.toBeNull();
    expect(await getEventType(db, "intruder", id)).toBeNull();
  });
});
