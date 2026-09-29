import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attendee, user } from "@/db/schema";
import { createBooking } from "@/features/bookings/server/service";
import { countPending, loadDashboard } from "@/features/dashboard/server/overview";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import { createEventType, findPublicEventType, findPublicHost } from "@/features/event-types/server/service";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const at = (iso: string) => Date.parse(iso);
const NOW = at("2026-10-01T10:10:00Z"); // Thursday; the 10:00 booking is in progress
const booker = { name: "Grace", email: "grace@example.com", timeZone: "UTC", locale: "en" };

let introId = "";
let consultId = "";

beforeAll(async () => {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "booking", "schedule", "event_type", "slot_reservation" CASCADE`);
  await db.insert(user).values({ id: "host1", name: "Ada", email: "ada@example.com", username: "ada", emailVerified: true, timeZone: "UTC" });
  await ensureDefaultSchedule(db, "host1", "UTC");
  const make = (title: string, slug: string, requiresConfirmation: boolean) =>
    createEventType(db, "host1", eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title, slug, minNoticeMinutes: 0, requiresConfirmation }));
  introId = await make("Intro", "intro", false);
  consultId = await make("Consultation", "consult", true);

  const host = (await findPublicHost(db, "ada"))!;
  const intro = (await findPublicEventType(db, host.id, "intro"))!;
  const consult = (await findPublicEventType(db, host.id, "consult"))!;
  const book = (eventType: typeof intro, start: string, now: number) =>
    createBooking(db, { host, eventType, start: at(start), durationMin: 30, booker, guests: [], now });

  const past = await book(intro, "2026-09-24T10:00:00Z", at("2026-09-24T08:00:00Z")); // last week
  await db.update(attendee).set({ noShow: true }).where(eq(attendee.bookingId, past.booking.id));
  await book(intro, "2026-10-01T10:00:00Z", at("2026-10-01T08:00:00Z"));
  await book(consult, "2026-10-01T13:00:00Z", at("2026-10-01T08:00:00Z")); // pending
  await book(intro, "2026-10-02T09:00:00Z", at("2026-10-01T08:00:00Z")); // tomorrow
  await book(intro, "2026-10-05T09:00:00Z", at("2026-10-01T08:00:00Z")); // next week: not shown
});

describe("loadDashboard (ADM-005)", () => {
  it("lists today's and tomorrow's active bookings, keeping one in progress", async () => {
    const data = await loadDashboard(db, "host1", { now: NOW, timeZone: "UTC", weekStart: 1 });
    expect(data.upcoming.map((b) => [new Date(b.startAt).toISOString(), b.status])).toEqual([
      ["2026-10-01T10:00:00.000Z", "accepted"],
      ["2026-10-01T13:00:00.000Z", "pending"],
      ["2026-10-02T09:00:00.000Z", "accepted"],
    ]);
    expect(data.upcoming[0]).toMatchObject({ eventTitle: "Intro", attendeeName: "Grace" });
    expect(data.today).toHaveLength(2);
  });

  it("counts this week against last week, per event type", async () => {
    const data = await loadDashboard(db, "host1", { now: NOW, timeZone: "UTC", weekStart: 1 });
    expect(data.week).toEqual({ count: 3, previous: 1, byEventType: { [introId]: 2, [consultId]: 1 } });
  });

  it("counts pending requests and no-shows over the last 30 days", async () => {
    const data = await loadDashboard(db, "host1", { now: NOW, timeZone: "UTC", weekStart: 1 });
    expect(data.pendingCount).toBe(1);
    expect(await countPending(db, "host1", NOW)).toBe(1);
    expect(data.noShows).toEqual({ count: 1, of: 1 });
  });

  it("shows nothing to another user", async () => {
    await db.insert(user).values({ id: "other", name: "Bo", email: "bo@example.com", emailVerified: true, timeZone: "UTC" }).onConflictDoNothing();
    const data = await loadDashboard(db, "other", { now: NOW, timeZone: "UTC", weekStart: 1 });
    expect(data).toEqual({ upcoming: [], today: [], week: { count: 0, previous: 0, byEventType: {} }, pendingCount: 0, noShows: { count: 0, of: 0 } });
  });
});
