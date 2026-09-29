import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { user } from "@/db/schema";
import { cancelByHost, countHostBookings, createBooking, listHostBookings } from "@/features/bookings/server/service";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import { createEventType, findPublicEventType, findPublicHost } from "@/features/event-types/server/service";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const at = (iso: string) => Date.parse(iso);
const NOW = at("2026-10-01T10:10:00Z"); // the 10:00 booking is in progress
const booker = { name: "Grace", email: "grace@example.com", timeZone: "UTC", locale: "en" };

let introId = "";

beforeAll(async () => {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "booking", "schedule", "event_type", "slot_reservation" CASCADE`);
  await db
    .insert(user)
    .values({
      id: "host1",
      name: "Ada",
      email: "ada@example.com",
      username: "ada",
      emailVerified: true,
      timeZone: "UTC",
    });
  await db
    .insert(user)
    .values({ id: "other", name: "Bo", email: "bo@example.com", emailVerified: true, timeZone: "UTC" });
  await ensureDefaultSchedule(db, "host1", "UTC");
  const make = (title: string, slug: string, requiresConfirmation: boolean) =>
    createEventType(
      db,
      "host1",
      eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title, slug, minNoticeMinutes: 0, requiresConfirmation }),
    );
  introId = await make("Intro", "intro", false);
  await make("Consultation", "consult", true);

  const host = (await findPublicHost(db, "ada"))!;
  const intro = (await findPublicEventType(db, host.id, "intro"))!;
  const consult = (await findPublicEventType(db, host.id, "consult"))!;
  const booked = at("2026-09-28T08:00:00Z");
  const book = (eventType: typeof intro, start: string) =>
    createBooking(db, { host, eventType, start: at(start), durationMin: 30, booker, guests: [], now: booked });

  await book(intro, "2026-09-29T10:00:00Z"); // past
  await book(intro, "2026-10-01T10:00:00Z"); // in progress
  await book(consult, "2026-10-01T13:00:00Z"); // pending
  await book(consult, "2026-10-06T09:00:00Z"); // pending, next week
  await book(intro, "2026-10-02T09:00:00Z");
  const cancelled = await book(intro, "2026-10-05T09:00:00Z");
  await cancelByHost(db, { hostId: "host1", bookingId: cancelled.booking.id, now: booked });
});

describe("host bookings page queries (BKG-010)", () => {
  it("lists pending requests under Upcoming too, soonest first", async () => {
    const rows = await listHostBookings(db, "host1", { tab: "upcoming", now: NOW });
    expect(rows.map((b) => [b.startAt.toISOString(), b.status])).toEqual([
      ["2026-10-01T10:00:00.000Z", "accepted"],
      ["2026-10-01T13:00:00.000Z", "pending"],
      ["2026-10-02T09:00:00.000Z", "accepted"],
      ["2026-10-06T09:00:00.000Z", "pending"],
    ]);
    expect((await listHostBookings(db, "host1", { tab: "unconfirmed", now: NOW })).map((b) => b.status)).toEqual([
      "pending",
      "pending",
    ]);
  });

  it("counts upcoming and unconfirmed bookings", async () => {
    expect(await countHostBookings(db, "host1", { now: NOW })).toEqual({ upcoming: 4, unconfirmed: 2 });
  });

  it("applies the list's filters to the counts", async () => {
    expect(await countHostBookings(db, "host1", { now: NOW, eventTypeId: introId })).toEqual({
      upcoming: 2,
      unconfirmed: 0,
    });
    const window = { from: at("2026-10-01T00:00:00Z"), to: at("2026-10-02T00:00:00Z") };
    expect(await countHostBookings(db, "host1", { now: NOW, ...window })).toEqual({ upcoming: 2, unconfirmed: 1 });
    expect(await listHostBookings(db, "host1", { tab: "upcoming", now: NOW, ...window })).toHaveLength(2);
  });

  it("counts nothing for another user", async () => {
    expect(await countHostBookings(db, "other", { now: NOW })).toEqual({ upcoming: 0, unconfirmed: 0 });
  });
});
