import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { booking, user } from "@/db/schema";
import { requestReschedule, rescheduleRequestEmail } from "@/features/bookings/server/reschedule-request";
import { cancelByHost, createBooking, findBookingForManage } from "@/features/bookings/server/service";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import { createEventType, findPublicEventType, findPublicHost } from "@/features/event-types/server/service";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { createCipher } from "@/lib/crypto/encryption";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const APP = "https://cal.example.com";
const NOW = Date.parse("2026-10-01T08:00:00Z"); // Thursday
const MONDAY_10 = Date.parse("2026-10-05T10:00:00Z");
const MONDAY_11 = Date.parse("2026-10-05T11:00:00Z");
const booker = { name: "Grace", email: "grace@example.com", timeZone: "Europe/Istanbul", locale: "en" };
const cipher = createCipher({ current: Buffer.alloc(32, 7).toString("base64") });

async function book(patch: Partial<typeof DEFAULT_EVENT_TYPE> = {}) {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "booking", "schedule", "event_type", "slot_reservation" CASCADE`);
  await db.insert(user).values([
    { id: "host1", name: "Ada", email: "ada@example.com", username: "ada", emailVerified: true, timeZone: "UTC" },
    { id: "other", name: "Eve", email: "eve@example.com", username: "eve", emailVerified: true, timeZone: "UTC" },
  ]);
  await ensureDefaultSchedule(db, "host1", "UTC");
  await createEventType(db, "host1", eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title: "Intro", slug: "intro", minNoticeMinutes: 0, ...patch }));
  const host = (await findPublicHost(db, "ada"))!;
  const eventType = (await findPublicEventType(db, host.id, "intro"))!;
  const input = { host, eventType, start: MONDAY_10, durationMin: 30, booker, guests: ["guest@example.com"], now: NOW };
  const created = await createBooking(db, input);
  // As the public booking action does (NTF-005): the booker's token, sealed on the row.
  await db.update(booking).set({ manageTokenSealed: cipher.encrypt(created.token, created.booking.id) }).where(eq(booking.id, created.booking.id));
  return { created, input };
}

const ask = (bookingId: string, hostId = "host1", message?: string) =>
  requestReschedule(db, cipher, { hostId, bookingId, message, now: NOW, appUrl: APP });

const rowOf = async (id: string) => (await db.select().from(booking).where(eq(booking.id, id)))[0];

describe("host asks the invitee to pick a new time (BKG-010)", () => {
  let created: Awaited<ReturnType<typeof book>>["created"];
  let input: Awaited<ReturnType<typeof book>>["input"];
  beforeEach(async () => {
    ({ created, input } = await book());
  });

  it("keeps the booking, marks it and links to the booking page in reschedule mode", async () => {
    const result = await ask(created.booking.id, "host1", "Something came up");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rescheduleUrl).toBe(`${APP}/ada/intro?reschedule=${created.booking.uid}&token=${created.token}`);
    expect(result.manageUrl).toBe(`${APP}/booking/${created.booking.uid}?token=${created.token}`);

    const row = await rowOf(created.booking.id);
    expect(row).toMatchObject({ status: "accepted", rescheduleRequestMessage: "Something came up" });
    expect(row.rescheduleRequestedAt).toEqual(new Date(NOW));
    expect((await findBookingForManage(db, created.booking.uid, created.token))?.canManage).toBe(true);
  });

  it("emails only the booker, in their own time zone, with the host's message", async () => {
    const result = await ask(created.booking.id, "host1", "Sorry!");
    if (!result.ok) throw new Error("expected ok");
    const email = rescheduleRequestEmail(result);
    expect(email).toMatchObject({
      to: "grace@example.com",
      template: "reschedule-requested",
      props: { timeZone: "Europe/Istanbul", hostName: "Ada", attendeeName: "Grace", message: "Sorry!", start: MONDAY_10 },
    });
  });

  it("moves the booking once the invitee picks a new time through the link", async () => {
    await ask(created.booking.id);
    const moved = await createBooking(db, { ...input, start: MONDAY_11, guests: [], reschedule: { uid: created.booking.uid, token: created.token } });
    expect(await rowOf(created.booking.id)).toMatchObject({ status: "cancelled", rescheduled: true });
    expect(moved.booking).toMatchObject({ status: "accepted", rescheduleRequestedAt: null });
  });

  it("only lets a host of the booking ask", async () => {
    expect(await ask(created.booking.id, "other")).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect((await rowOf(created.booking.id)).rescheduleRequestedAt).toBeNull();
  });

  it("refuses cancelled bookings and bookings without a sealed token", async () => {
    await db.update(booking).set({ manageTokenSealed: null }).where(eq(booking.id, created.booking.id));
    expect(await ask(created.booking.id)).toEqual({ ok: false, reason: "NOT_MOVABLE" });
    await cancelByHost(db, { hostId: "host1", bookingId: created.booking.id, now: NOW });
    expect(await ask(created.booking.id)).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("event types that turn rescheduling off", () => {
  it("can't be asked to move", async () => {
    const { created } = await book({ disableRescheduling: true });
    expect(await ask(created.booking.id)).toEqual({ ok: false, reason: "NOT_MOVABLE" });
    expect((await rowOf(created.booking.id)).rescheduleRequestedAt).toBeNull();
  });
});
