import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { user } from "@/db/schema";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import { createEventType } from "@/features/event-types/server/service";
import { DEFAULT_RULES } from "@/features/schedules/schemas";
import { createSchedule, ensureDefaultSchedule, listSchedules } from "@/features/schedules/server/service";
import { eventTypeCountsBySchedule, loadScheduleCards } from "@/features/schedules/server/usage";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

let defaultId = "";
let weekendId = "";
let spareId = "";

const make = (userId: string, slug: string, scheduleId: string | null) =>
  createEventType(db, userId, eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title: slug, slug, scheduleId }));

beforeAll(async () => {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "booking", "schedule", "event_type" CASCADE`);
  await db.insert(user).values([
    { id: "host1", name: "Ada", email: "ada@example.com", username: "ada", emailVerified: true, timeZone: "UTC" },
    { id: "other", name: "Bo", email: "bo@example.com", username: "bo", emailVerified: true, timeZone: "UTC" },
  ]);
  defaultId = await ensureDefaultSchedule(db, "host1", "UTC");
  const input = { name: "Weekend", timeZone: "UTC", rules: DEFAULT_RULES, overrides: [] };
  weekendId = await createSchedule(db, "host1", input);
  spareId = await createSchedule(db, "host1", { ...input, name: "Spare" });
  await make("host1", "intro", null);
  await make("host1", "consult", defaultId);
  await make("host1", "weekend-a", weekendId);
  await make("host1", "weekend-b", weekendId);
  const otherDefault = await ensureDefaultSchedule(db, "other", "UTC");
  await make("other", "theirs", otherDefault);
  await make("other", "theirs-2", null);
});

describe("eventTypeCountsBySchedule", () => {
  it("counts event types per schedule, unassigned ones on the default", async () => {
    const schedules = await listSchedules(db, "host1");
    expect(await eventTypeCountsBySchedule(db, "host1", schedules)).toEqual({
      [defaultId]: 2,
      [weekendId]: 2,
      [spareId]: 0,
    });
  });

  it("ignores other users' event types", async () => {
    const schedules = await listSchedules(db, "other");
    const counts = await eventTypeCountsBySchedule(db, "other", schedules);
    expect(Object.values(counts)).toEqual([2]);
    expect(counts[defaultId]).toBeUndefined();
  });

  it("returns zeros without event types and nothing without schedules", async () => {
    await db
      .insert(user)
      .values({ id: "fresh", name: "Cy", email: "cy@example.com", emailVerified: true, timeZone: "UTC" });
    const id = await ensureDefaultSchedule(db, "fresh", "UTC");
    expect(await eventTypeCountsBySchedule(db, "fresh", await listSchedules(db, "fresh"))).toEqual({ [id]: 0 });
    expect(await eventTypeCountsBySchedule(db, "nobody", [])).toEqual({});
  });
});

describe("loadScheduleCards", () => {
  it("returns the user's schedules, default first, with usage and a summary line", async () => {
    const cards = await loadScheduleCards(db, "host1", 1);
    expect(cards.map((c) => [c.id, c.isDefault, c.eventTypeCount])).toEqual([
      [defaultId, true, 2],
      [weekendId, false, 2],
      [spareId, false, 0],
    ]);
    expect(cards[0]).toMatchObject({ name: "Working hours", line: "Mon – Fri · 09:00 – 17:00 · 2 event types" });
    expect(cards[0].rules).toHaveLength(5);
  });

  it("never includes another user's schedules", async () => {
    const cards = await loadScheduleCards(db, "other", 1);
    expect(cards).toHaveLength(1);
    expect(cards.map((c) => c.id)).not.toContain(defaultId);
  });
});
