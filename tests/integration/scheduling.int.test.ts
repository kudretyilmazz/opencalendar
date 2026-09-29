import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { booking, eventType, schedule, user } from "@/db/schema";
import { deleteAccount } from "@/features/account/server/service";
import { createBooking } from "@/features/bookings/server/service";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import {
  createEventType,
  deleteEventType,
  duplicateEventType,
  EventTypeError,
  findPublicEventType,
  findPublicHost,
  listEventTypes,
  listPublicEventTypes,
  moveEventType,
  setEventTypeEnabled,
  updateEventType,
} from "@/features/event-types/server/service";
import {
  createSchedule,
  deleteSchedule,
  ensureDefaultSchedule,
  getSchedule,
  listSchedules,
  ScheduleError,
  scheduleForEventType,
  setDefaultSchedule,
  updateSchedule,
} from "@/features/schedules/server/service";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

beforeEach(async () => {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "booking", "schedule", "event_type", "slot_reservation" CASCADE`);
  await db.insert(user).values([
    { id: "u1", name: "Ada", email: "ada@example.com", username: "ada", emailVerified: true },
    { id: "u2", name: "Eve", email: "eve@example.com", username: "eve", emailVerified: true },
  ]);
});

const form = (patch: Partial<typeof DEFAULT_EVENT_TYPE>) => eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, ...patch });

describe("schedules (AVL-001, AVL-002)", () => {
  it("creates a default schedule once and round-trips rules and overrides", async () => {
    const id = await ensureDefaultSchedule(db, "u1", "Europe/Istanbul");
    expect(await ensureDefaultSchedule(db, "u1", "UTC")).toBe(id);
    await updateSchedule(db, "u1", id, {
      name: "Office",
      timeZone: "Europe/Istanbul",
      rules: [
        { weekday: 1, start: "09:00", end: "12:00" },
        { weekday: 1, start: "13:00", end: "17:00" },
        { weekday: 5, start: "22:00", end: "00:00" },
      ],
      overrides: [
        { date: "2026-12-31", ranges: [] },
        { date: "2026-10-10", ranges: [{ start: "10:00", end: "11:00" }] },
      ],
    });
    const s = await getSchedule(db, "u1", id);
    expect(s).toMatchObject({
      name: "Office",
      isDefault: true,
      rules: [
        { weekday: 1, start: "09:00", end: "12:00" },
        { weekday: 1, start: "13:00", end: "17:00" },
        { weekday: 5, start: "22:00", end: "00:00" },
      ],
      overrides: [
        { date: "2026-10-10", ranges: [{ start: "10:00", end: "11:00" }] },
        { date: "2026-12-31", ranges: [] },
      ],
    });
  });

  it("switches the default and refuses to delete it", async () => {
    const a = await ensureDefaultSchedule(db, "u1", "UTC");
    const b = await createSchedule(db, "u1", { name: "Evenings", timeZone: "UTC", rules: [], overrides: [] });
    await expect(deleteSchedule(db, "u1", a)).rejects.toThrow(ScheduleError);
    await setDefaultSchedule(db, "u1", b);
    expect((await listSchedules(db, "u1")).map((s) => [s.id, s.isDefault])).toEqual([
      [a, false],
      [b, true],
    ]);
    await deleteSchedule(db, "u1", a);
    expect(await listSchedules(db, "u1")).toHaveLength(1);
  });

  it("is owner-scoped", async () => {
    const a = await ensureDefaultSchedule(db, "u1", "UTC");
    expect(await getSchedule(db, "u2", a)).toBeNull();
    await expect(updateSchedule(db, "u2", a, { name: "x", timeZone: "UTC", rules: [], overrides: [] })).rejects.toThrow(ScheduleError);
    await expect(setDefaultSchedule(db, "u2", a)).rejects.toThrow(ScheduleError);
    await expect(deleteSchedule(db, "u2", a)).rejects.toThrow(ScheduleError);
  });

  it("event types fall back to the default schedule and can't use someone else's", async () => {
    const mine = await ensureDefaultSchedule(db, "u1", "UTC");
    const theirs = await ensureDefaultSchedule(db, "u2", "UTC");
    expect((await scheduleForEventType(db, "u1", null))?.id).toBe(mine);
    expect((await scheduleForEventType(db, "u1", theirs))?.id).toBe(mine);
    await expect(createEventType(db, "u1", form({ title: "X", slug: "x", scheduleId: theirs }))).rejects.toThrow(EventTypeError);
  });
});

describe("event types (EVT-001, EVT-002, BKG-001)", () => {
  it("creates, updates, duplicates, reorders, toggles and deletes", async () => {
    const a = await createEventType(db, "u1", form({ title: "Intro", slug: "intro", extraDurations: [15, 60] }));
    const b = await createEventType(db, "u1", form({ title: "Deep dive", slug: "deep-dive" }));
    expect((await listEventTypes(db, "u1")).map((e) => e.slug)).toEqual(["intro", "deep-dive"]);
    expect((await listEventTypes(db, "u1"))[0].extraDurations).toEqual([15, 60]);

    await updateEventType(db, "u1", a, form({ title: "Intro call", slug: "intro", extraDurations: [45] }));
    expect((await listEventTypes(db, "u1"))[0]).toMatchObject({ title: "Intro call", extraDurations: [45] });

    const copy = await duplicateEventType(db, "u1", a);
    expect((await listEventTypes(db, "u1")).find((e) => e.id === copy)).toMatchObject({ slug: "intro-copy", extraDurations: [45] });

    await moveEventType(db, "u1", b, "up");
    expect((await listEventTypes(db, "u1")).map((e) => e.slug)).toEqual(["deep-dive", "intro", "intro-copy"]);

    await setEventTypeEnabled(db, "u1", b, false);
    const host = (await findPublicHost(db, "ADA"))!;
    expect((await listPublicEventTypes(db, host.id)).map((e) => e.slug)).toEqual(["intro", "intro-copy"]);
    expect(await findPublicEventType(db, host.id, "deep-dive")).toBeNull();

    await deleteEventType(db, "u1", copy);
    expect(await listEventTypes(db, "u1")).toHaveLength(2);
  });

  it("rejects duplicate slugs per owner but allows them across owners", async () => {
    await createEventType(db, "u1", form({ title: "Intro", slug: "intro" }));
    await expect(createEventType(db, "u1", form({ title: "Other", slug: "intro" }))).rejects.toMatchObject({ code: "SLUG_TAKEN" });
    await expect(createEventType(db, "u2", form({ title: "Intro", slug: "intro" }))).resolves.toBeTypeOf("string");
  });

  it("hidden event types are bookable by link but not listed (EVT-014 preview)", async () => {
    await createEventType(db, "u1", form({ title: "Secret", slug: "secret", hidden: true }));
    expect(await listPublicEventTypes(db, "u1")).toHaveLength(0);
    expect(await findPublicEventType(db, "u1", "secret")).not.toBeNull();
  });

  it("blocks other users from changing my event types", async () => {
    const a = await createEventType(db, "u1", form({ title: "Intro", slug: "intro" }));
    await expect(updateEventType(db, "u2", a, form({ title: "Hacked", slug: "intro" }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteEventType(db, "u2", a)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setEventTypeEnabled(db, "u2", a, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(duplicateEventType(db, "u2", a)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(moveEventType(db, "u2", a, "up")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("event type deletion guard", () => {
  it("refuses to delete an event type with upcoming bookings", async () => {
    await ensureDefaultSchedule(db, "u1", "UTC");
    const id = await createEventType(db, "u1", form({ title: "Intro", slug: "intro", minNoticeMinutes: 0 }));
    const host = (await findPublicHost(db, "ada"))!;
    const et = (await findPublicEventType(db, host.id, "intro"))!;
    const now = Date.parse("2026-10-01T00:00:00Z");
    await createBooking(db, {
      host,
      eventType: et,
      start: Date.parse("2026-10-05T10:00:00Z"),
      durationMin: 30,
      booker: { name: "Grace", email: "grace@example.com", timeZone: "UTC", locale: "en" },
      guests: [],
      now,
    });
    await expect(deleteEventType(db, "u1", id, now)).rejects.toMatchObject({ code: "HAS_UPCOMING_BOOKINGS" });
    // Once the meeting is over, deletion is allowed.
    await expect(deleteEventType(db, "u1", id, Date.parse("2026-10-06T00:00:00Z"))).resolves.toBeUndefined();
  });
});

describe("account deletion (ADM-006)", () => {
  it("cancels upcoming bookings, then removes the user and everything they own", async () => {
    await ensureDefaultSchedule(db, "u1", "UTC");
    await createEventType(db, "u1", form({ title: "Intro", slug: "intro", minNoticeMinutes: 0 }));
    const host = (await findPublicHost(db, "ada"))!;
    const et = (await findPublicEventType(db, host.id, "intro"))!;
    const now = Date.parse("2026-10-01T00:00:00Z");
    await createBooking(db, {
      host,
      eventType: et,
      start: Date.parse("2026-10-05T10:00:00Z"),
      durationMin: 30,
      booker: { name: "Grace", email: "grace@example.com", timeZone: "UTC", locale: "en" },
      guests: [],
      now,
    });

    const cancelled = await deleteAccount(db, "u1", now);
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].booking).toMatchObject({ status: "cancelled", cancelledBy: "system" });
    expect(cancelled[0].attendees[0].email).toBe("grace@example.com");

    expect(await db.select().from(user).where(eq(user.id, "u1"))).toHaveLength(0);
    expect(await db.select().from(schedule).where(eq(schedule.userId, "u1"))).toHaveLength(0);
    expect(await db.select().from(eventType).where(eq(eventType.ownerUserId, "u1"))).toHaveLength(0);
    expect(await db.select().from(booking)).toHaveLength(0);
    // Other users are untouched.
    expect(await db.select().from(user).where(eq(user.id, "u2"))).toHaveLength(1);
  });
});
