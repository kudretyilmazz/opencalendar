import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eventType, membership, team, user, webhookDelivery } from "@/db/schema";
import { TeamError } from "@/features/teams/server/access";
import { HEALTH_WINDOW, MAX_DELIVERY_ATTEMPTS, personalWebhookOverview, RECENT_SCOPE_DELIVERIES, teamWebhookOverview } from "@/features/webhooks/server/overview";
import { createWebhook } from "@/features/webhooks/server/service";
import { createTeamWebhook } from "@/features/webhooks/server/team-service";
import { createCipher } from "@/lib/crypto/encryption";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);
const cipher = createCipher({ current: Buffer.alloc(32, 7).toString("base64") });

const NOW = Date.parse("2026-09-30T12:00:00Z");
const MIN = 60_000;
const DAY = 86_400_000;

type Status = "pending" | "success" | "failed";
let counter = 0;
async function deliver(webhookId: string, msAgo: number, status: Status, extra: { attempts?: number; responseStatus?: number | null; error?: string | null } = {}) {
  const id = `d-${++counter}`;
  await db.insert(webhookDelivery).values({
    id,
    webhookId,
    trigger: "BOOKING_CREATED",
    payload: {},
    status,
    attempts: extra.attempts ?? (status === "pending" ? 0 : 1),
    responseStatus: extra.responseStatus === undefined ? (status === "success" ? 200 : status === "failed" ? 500 : null) : extra.responseStatus,
    latencyMs: status === "pending" ? null : 120,
    error: extra.error === undefined ? (status === "failed" ? "HTTP 500" : null) : extra.error,
    createdAt: new Date(NOW - msAgo),
  });
  return id;
}

let hookA = "";
let hookB = "";
let teamHook = "";

beforeEach(async () => {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "event_type", "webhook" CASCADE`);
  await db.insert(user).values([
    { id: "u1", name: "Ada", email: "ada@example.com", username: "ada", emailVerified: true, timeZone: "UTC" },
    { id: "u2", name: "Bob", email: "bob@example.com", username: "bob", emailVerified: true, timeZone: "UTC" },
  ]);
  await db.insert(eventType).values({ id: "et1", ownerUserId: "u1", title: "Product demo", slug: "demo", durationMinutes: 30 });
  await db.insert(team).values({ id: "t1", name: "Acme", slug: "acme" });
  await db.insert(membership).values([
    { teamId: "t1", userId: "u1", role: "owner" },
    { teamId: "t1", userId: "u2", role: "member" },
  ]);
  hookA = (await createWebhook(db, cipher, "u1", { url: "https://hooks.example.com/oc", eventTypeId: null, triggers: ["BOOKING_CREATED"] })).id;
  hookB = (await createWebhook(db, cipher, "u1", { url: "https://crm.acme.dev/intake", eventTypeId: "et1", triggers: ["BOOKING_CREATED", "FORM_SUBMITTED"] })).id;
  teamHook = (await createTeamWebhook(db, cipher, "u1", "t1", { url: "https://team.example.com/h", triggers: ["BOOKING_CREATED"] })).id;
});

describe("personalWebhookOverview (webhooks page)", () => {
  it("lists the user's personal webhooks with the event type scope", async () => {
    const overview = await personalWebhookOverview(db, "u1", NOW);
    expect(overview.webhooks.map((w) => [w.url, w.eventTypeTitle])).toEqual([
      ["https://hooks.example.com/oc", null],
      ["https://crm.acme.dev/intake", "Product demo"],
    ]);
    expect(overview).toMatchObject({ latestByWebhook: {}, recent: [], week: { success: 0, failed: 0 } });
    expect((await personalWebhookOverview(db, "u2", NOW)).webhooks).toEqual([]);
  });

  it("keeps each webhook's latest deliveries, newest first, capped", async () => {
    for (let i = 0; i < HEALTH_WINDOW + 2; i++) await deliver(hookA, (i + 1) * MIN, "success");
    await deliver(hookB, 1 * MIN, "failed", { attempts: MAX_DELIVERY_ATTEMPTS });
    await deliver(hookB, 2 * MIN, "pending", { attempts: 2, responseStatus: 502, error: "HTTP 502" });
    await deliver(teamHook, 1 * MIN, "failed"); // other scope

    const { latestByWebhook } = await personalWebhookOverview(db, "u1", NOW);
    expect(Object.keys(latestByWebhook).sort()).toEqual([hookA, hookB].sort());
    expect(latestByWebhook[hookA]).toHaveLength(HEALTH_WINDOW);
    expect(latestByWebhook[hookA][0].createdAt.getTime()).toBe(NOW - MIN);
    expect(latestByWebhook[hookB].map((d) => [d.status, d.attempts, d.responseStatus])).toEqual([
      ["failed", MAX_DELIVERY_ATTEMPTS, 500],
      ["pending", 2, 502],
    ]);
  });

  it("lists recent deliveries across the scope with their endpoint", async () => {
    await deliver(hookA, 3 * MIN, "success");
    await deliver(hookB, 1 * MIN, "failed");
    await deliver(teamHook, 0, "success"); // other scope
    const { recent } = await personalWebhookOverview(db, "u1", NOW);
    expect(recent.map((d) => [d.url, d.status, d.latencyMs])).toEqual([
      ["https://crm.acme.dev/intake", "failed", 120],
      ["https://hooks.example.com/oc", "success", 120],
    ]);
  });

  it("caps the recent list", async () => {
    for (let i = 0; i < RECENT_SCOPE_DELIVERIES + 3; i++) await deliver(hookA, i * MIN, "success");
    expect((await personalWebhookOverview(db, "u1", NOW)).recent).toHaveLength(RECENT_SCOPE_DELIVERIES);
  });

  it("counts settled deliveries of the last 7 days", async () => {
    await deliver(hookA, DAY, "success");
    await deliver(hookA, 2 * DAY, "success");
    await deliver(hookB, 3 * DAY, "failed");
    await deliver(hookB, MIN, "pending"); // not settled
    await deliver(hookA, 8 * DAY, "failed"); // too old
    await deliver(teamHook, DAY, "failed"); // other scope
    expect((await personalWebhookOverview(db, "u1", NOW)).week).toEqual({ success: 2, failed: 1 });
  });
});

describe("teamWebhookOverview", () => {
  it("shows a team's webhooks and deliveries to its admins only", async () => {
    await deliver(teamHook, MIN, "failed");
    await deliver(hookA, MIN, "success"); // personal: not in the team scope
    const overview = await teamWebhookOverview(db, "u1", "t1", NOW);
    expect(overview.webhooks.map((w) => w.id)).toEqual([teamHook]);
    expect(overview.recent.map((d) => d.webhookId)).toEqual([teamHook]);
    expect(overview.week).toEqual({ success: 0, failed: 1 });
    await expect(teamWebhookOverview(db, "u2", "t1", NOW)).rejects.toBeInstanceOf(TeamError);
    await expect(teamWebhookOverview(db, "stranger", "t1", NOW)).rejects.toBeInstanceOf(TeamError);
  });
});

it("allows eleven delivery attempts (API-003)", () => {
  expect(MAX_DELIVERY_ATTEMPTS).toBe(11);
});
