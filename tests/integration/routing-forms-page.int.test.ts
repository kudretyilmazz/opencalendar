import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { booking, eventType, membership, routingForm, routingFormResponse, team, user } from "@/db/schema";
import type { RoutingAction } from "@/db/schema/routing";
import { routingFormSchema } from "@/features/routing-forms/schemas";
import { LATEST_RESPONSES, loadRoutingOverview } from "@/features/routing-forms/server/overview";
import { createForm, getManagedForm, getPublicForm, RoutingError, setFormDisabled } from "@/features/routing-forms/server/service";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-30T12:00:00Z");
const msg = (message: string): RoutingAction => ({ kind: "message", message });

const input = (name: string, fallback: RoutingAction, eventTypeId = "et-demo") =>
  routingFormSchema.parse({
    name,
    fields: [
      { key: "company", label: "Company", type: "text", required: false },
      { key: "size", label: "Team size", type: "select", required: false, options: ["small", "large"] },
    ],
    rules: [{ id: "r1", match: "all", conditions: [{ field: "size", operator: "equals", value: ["large"] }], action: { kind: "event_type", eventTypeId } }],
    fallback,
  });

let respCounter = 0;
async function respond(formId: string, at: number, action: RoutingAction, answers: Record<string, string> = { company: "Acme" }): Promise<string> {
  const id = `resp-${++respCounter}`;
  await db.insert(routingFormResponse).values({ id, formId, answers, trace: [], matchedRuleId: null, action, createdAt: new Date(at) });
  return id;
}

beforeEach(async () => {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "team", "event_type", "routing_form", "booking" CASCADE`);
  await db.insert(user).values([
    { id: "alice", name: "Alice", email: "alice@example.com", username: "alice", emailVerified: true, timeZone: "UTC" },
    { id: "bob", name: "Bob", email: "bob@example.com", username: "bob", emailVerified: true, timeZone: "UTC" },
    { id: "carol", name: "Carol", email: "carol@example.com", username: "carol", emailVerified: true, timeZone: "UTC" },
  ]);
  await db.insert(eventType).values([
    { id: "et-demo", ownerUserId: "alice", title: "Product demo", slug: "demo", durationMinutes: 30 },
    { id: "et-intro", ownerUserId: "alice", title: "Intro call", slug: "intro", durationMinutes: 30 },
  ]);
  await db.insert(team).values({ id: "t1", name: "Robin Studio", slug: "robin" });
  await db.insert(eventType).values({ id: "et-team", ownerUserId: "bob", teamId: "t1", schedulingType: "collective", title: "Team call", slug: "call", durationMinutes: 30 });
  await db.insert(membership).values([
    { teamId: "t1", userId: "alice", role: "admin" },
    { teamId: "t1", userId: "bob", role: "owner" },
    { teamId: "t1", userId: "carol", role: "member" },
  ]);
});

describe("loadRoutingOverview (routing forms page)", () => {
  it("returns nothing for a user without forms", async () => {
    expect(await loadRoutingOverview(db, "carol", NOW)).toEqual({ forms: [], titles: {}, trend: {}, latest: [] });
  });

  it("resolves route titles and counts 30 days of responses in 3-day buckets", async () => {
    const id = await createForm(db, "alice", null, input("Lead intake", { kind: "event_type", eventTypeId: "et-intro" }));
    const action = msg("Thanks");
    await respond(id, NOW - 1000, action);
    await respond(id, NOW - 2 * DAY, action);
    await respond(id, NOW - 29 * DAY, action);
    await respond(id, NOW - 31 * DAY, action); // outside the window
    await respond(id, NOW + DAY, action); // in the future: outside

    const overview = await loadRoutingOverview(db, "alice", NOW);
    expect(overview.forms.map((f) => f.name)).toEqual(["Lead intake"]);
    expect(overview.titles).toEqual({ "et-demo": "Product demo", "et-intro": "Intro call" });
    expect(overview.trend[id]).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
  });

  it("includes team forms of teams the user administers, not of teams they merely belong to", async () => {
    const teamForm = await createForm(db, "bob", "t1", input("Support triage", msg("Hi"), "et-team"));
    await respond(teamForm, NOW - DAY, msg("Hi"));
    const alice = await loadRoutingOverview(db, "alice", NOW);
    expect(alice.forms.map((f) => [f.name, f.teamName])).toEqual([["Support triage", "Robin Studio"]]);
    expect(alice.titles).toEqual({ "et-team": "Team call" });
    expect(alice.latest).toHaveLength(1);
    expect((await loadRoutingOverview(db, "carol", NOW)).forms).toEqual([]);
  });

  it("lists the latest responses across forms, newest first, with the booking they led to", async () => {
    const a = await createForm(db, "alice", null, input("A", msg("Thanks")));
    const b = await createForm(db, "alice", null, input("B", msg("Thanks")));
    const bobForm = await createForm(db, "bob", null, routingFormSchema.parse({ name: "Bob's", fields: [], rules: [], fallback: msg("x") }));
    await respond(bobForm, NOW, msg("x")); // someone else's: never shown
    const booked = await respond(a, NOW - 3 * DAY, { kind: "event_type", eventTypeId: "et-demo" }, { company: "Helio" });
    await respond(b, NOW - DAY, msg("Thanks"), { company: "Lumen" });
    for (let i = 0; i < LATEST_RESPONSES; i++) await respond(a, NOW - (10 + i) * DAY, msg("Thanks"));
    await db.insert(booking).values({
      id: "bk1",
      uid: "uid-1",
      manageTokenHash: "h",
      icalUid: "ical-1",
      eventTypeId: "et-demo",
      organizerId: "alice",
      status: "accepted",
      title: "Product demo with Helio",
      startAt: new Date(NOW + DAY),
      endAt: new Date(NOW + DAY + 1_800_000),
      timeZone: "UTC",
      routingFormResponseId: booked,
    });

    const { latest } = await loadRoutingOverview(db, "alice", NOW);
    expect(latest).toHaveLength(LATEST_RESPONSES);
    expect(latest.map((r) => r.answers.company)).toEqual(["Lumen", "Helio", "Acme", "Acme", "Acme"]);
    expect(latest.map((r) => r.bookedEventTitle)).toEqual([null, "Product demo", null, null, null]);
    expect(latest.every((r) => r.formId !== bobForm)).toBe(true);
  });
});

describe("setFormDisabled (the Accepting switch)", () => {
  it("closes and reopens a form for its manager", async () => {
    const id = await createForm(db, "alice", null, input("Lead intake", msg("Thanks")));
    await setFormDisabled(db, "alice", id, true);
    expect((await getManagedForm(db, "alice", id)).disabled).toBe(true);
    expect(await getPublicForm(db, id)).toBeNull();
    await setFormDisabled(db, "alice", id, false);
    expect(await getPublicForm(db, id)).not.toBeNull();
  });

  it("lets team admins toggle team forms and hides forms from everyone else", async () => {
    const teamForm = await createForm(db, "bob", "t1", input("Support", msg("Hi"), "et-team"));
    await setFormDisabled(db, "alice", teamForm, true);
    const [row] = await db.select({ disabled: routingForm.disabled }).from(routingForm).where(sql`${routingForm.id} = ${teamForm}`);
    expect(row.disabled).toBe(true);

    const personal = await createForm(db, "alice", null, input("Mine", msg("Thanks")));
    await expect(setFormDisabled(db, "bob", personal, true)).rejects.toBeInstanceOf(RoutingError);
    await expect(setFormDisabled(db, "carol", teamForm, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setFormDisabled(db, "alice", "missing", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getManagedForm(db, "alice", personal)).disabled).toBe(false);
  });
});
