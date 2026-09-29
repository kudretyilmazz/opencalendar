import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { attendee, booking, bookingHost, eventType, user, webhook, webhookDelivery } from "@/db/schema";
import { setNoShow } from "@/features/bookings/server/decisions";
import { routingFormSchema } from "@/features/routing-forms/schemas";
import { createForm, submitResponse } from "@/features/routing-forms/server/service";
import { createTeam } from "@/features/teams/server/service";
import { webhookEnvelopeSchema } from "@/features/webhooks/payload";
import { createWebhookDeliverHandler } from "@/features/webhooks/server/deliver";
import { createBookingEndedHandler } from "../../jobs/booking-ended";
import { emitPing, emitTeamPing, emitWebhooks } from "@/features/webhooks/server/emit";
import { createWebhook, deleteWebhook, listDeliveries, listWebhooks, redeliver, rollWebhookSecret, updateWebhook, WebhookError } from "@/features/webhooks/server/service";
import {
  createTeamWebhook,
  deleteTeamWebhook,
  listTeamDeliveries,
  listTeamWebhooks,
  redeliverTeam,
  rollTeamWebhookSecret,
  toggleTeamWebhook,
  updateTeamWebhook,
} from "@/features/webhooks/server/team-service";
import { checkWebhookUrl } from "@/features/webhooks/server/url";
import { verifySignature } from "@/features/webhooks/signature";
import { createCipher } from "@/lib/crypto/encryption";
import { resetDatabase, testDatabase } from "./helpers";
import { code, world } from "./team-fixtures";

const { db, close } = testDatabase();
const cipher = createCipher({ current: Buffer.alloc(32, 7).toString("base64") });

type Received = { headers: IncomingHttpHeaders; body: string };
const received: Received[] = [];
let respondWith = 200;
let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      if (respondWith === 302) res.writeHead(302, { location: "http://127.0.0.1:1/elsewhere" });
      else res.writeHead(respondWith, { "content-type": "text/plain" });
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await close();
});

const START = new Date("2026-10-05T10:00:00Z");

async function seed() {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "booking", "event_type", "webhook" CASCADE`);
  await db.insert(user).values([
    { id: "u1", name: "Ada", email: "ada@example.com", username: "ada", emailVerified: true, timeZone: "UTC" },
    { id: "u2", name: "Bob", email: "bob@example.com", username: "bob", emailVerified: true, timeZone: "UTC" },
  ]);
  await db.insert(eventType).values([
    { id: "et1", ownerUserId: "u1", title: "Intro", slug: "intro", durationMinutes: 30 },
    { id: "et2", ownerUserId: "u1", title: "Deep dive", slug: "deep", durationMinutes: 60 },
    { id: "et3", ownerUserId: "u2", title: "Other", slug: "other", durationMinutes: 30 },
  ]);
  await db.insert(booking).values({
    id: "b1",
    uid: "uid-b1",
    manageTokenHash: "never-sent",
    icalUid: "ical-b1",
    eventTypeId: "et1",
    organizerId: "u1",
    status: "accepted",
    title: "Intro with Grace",
    startAt: START,
    endAt: new Date(START.getTime() + 30 * 60_000),
    timeZone: "UTC",
    responses: { company: "Acme" },
  });
  await db.insert(attendee).values({ id: "a1", bookingId: "b1", name: "Grace", email: "grace@example.com", timeZone: "Europe/Istanbul" });
}

const hook = (owner: string, url: string, eventTypeId: string | null, triggers: string[]) =>
  createWebhook(db, cipher, owner, { url, eventTypeId, triggers: triggers as never });

function collector() {
  const ids: string[] = [];
  return { ids, enqueue: async (id: string) => void ids.push(id) };
}

const job = (deliveryId: string, retryCount = 0, retryLimit = 10) => ({ id: `job-${deliveryId}`, data: { deliveryId }, retryCount, retryLimit });
const delivery = async (id: string) => (await db.select().from(webhookDelivery).where(eq(webhookDelivery.id, id)))[0];

beforeEach(async () => {
  received.length = 0;
  respondWith = 200;
  await seed();
});

describe("emitWebhooks (API-001)", () => {
  it("selects active subscriptions of the organizer by scope and trigger", async () => {
    const all = await hook("u1", `${base}/all`, null, ["BOOKING_CREATED"]);
    const scoped = await hook("u1", `${base}/et1`, "et1", ["BOOKING_CREATED", "BOOKING_CANCELLED"]);
    await hook("u1", `${base}/et2`, "et2", ["BOOKING_CREATED"]);
    await hook("u1", `${base}/cancel-only`, null, ["BOOKING_CANCELLED"]);
    const paused = await hook("u1", `${base}/paused`, null, ["BOOKING_CREATED"]);
    await updateWebhook(db, "u1", paused.id, { active: false });
    await hook("u2", `${base}/other-user`, null, ["BOOKING_CREATED"]);

    const { ids, enqueue } = collector();
    expect(await emitWebhooks({ db, enqueue }, { trigger: "BOOKING_CREATED", bookingId: "b1" })).toBe(2);
    const rows = await db.select().from(webhookDelivery);
    expect(rows.map((r) => r.webhookId).sort()).toEqual([all.id, scoped.id].sort());
    expect(ids.sort()).toEqual(rows.map((r) => r.id).sort());

    const envelope = webhookEnvelopeSchema.parse(rows[0].payload);
    expect(envelope).toMatchObject({ version: 1, id: rows[0].id, trigger: "BOOKING_CREATED" });
    expect(envelope.payload).toMatchObject({ booking: { uid: "uid-b1", eventType: { id: "et1", slug: "intro" }, responses: { company: "Acme" } } });
    expect(JSON.stringify(envelope)).not.toContain("never-sent");
  });

  it("returns 0 for unknown bookings and is idempotent with an event key", async () => {
    await hook("u1", `${base}/all`, null, ["BOOKING_CREATED"]);
    const { enqueue } = collector();
    expect(await emitWebhooks({ db, enqueue }, { trigger: "BOOKING_CREATED", bookingId: "missing" })).toBe(0);
    await emitWebhooks({ db, enqueue }, { trigger: "BOOKING_CREATED", bookingId: "b1", eventKey: "b1:created" });
    await emitWebhooks({ db, enqueue }, { trigger: "BOOKING_CREATED", bookingId: "b1", eventKey: "b1:created" });
    expect(await db.$count(webhookDelivery)).toBe(1);
  });
});

describe("webhook delivery (API-002, API-003)", () => {
  it("POSTs a signed body that verifies with the subscription secret", async () => {
    const { secret } = await hook("u1", `${base}/hook`, null, ["BOOKING_CREATED"]);
    const { ids, enqueue } = collector();
    await emitWebhooks({ db, enqueue }, { trigger: "BOOKING_CREATED", bookingId: "b1" });
    await createWebhookDeliverHandler({ db, cipher, allowPrivate: true })([job(ids[0])]);

    expect(received).toHaveLength(1);
    const [{ headers, body }] = received;
    expect(headers["x-opencalendar-event"]).toBe("BOOKING_CREATED");
    expect(headers["x-opencalendar-delivery"]).toBe(ids[0]);
    expect(headers["user-agent"]).toBe("OpenCalendar-Webhooks/1");
    expect(headers["content-type"]).toBe("application/json");
    const header = String(headers["x-opencalendar-signature"]);
    expect(verifySignature({ secret, body, header, nowSeconds: Math.floor(Date.now() / 1000) })).toBe(true);
    expect(verifySignature({ secret: "whsec_wrong", body, header, nowSeconds: Math.floor(Date.now() / 1000) })).toBe(false);
    expect(JSON.parse(body)).toMatchObject({ id: ids[0], trigger: "BOOKING_CREATED" });

    expect(await delivery(ids[0])).toMatchObject({ status: "success", attempts: 1, responseStatus: 200, error: null });
    expect((await delivery(ids[0])).latencyMs).not.toBeNull();
    // A repeated job for a delivered row is a no-op.
    await createWebhookDeliverHandler({ db, cipher, allowPrivate: true })([job(ids[0])]);
    expect(received).toHaveLength(1);
  });

  it("throws on non-2xx so pg-boss retries, and marks the last attempt failed", async () => {
    await hook("u1", `${base}/hook`, null, ["BOOKING_CREATED"]);
    const { ids, enqueue } = collector();
    await emitWebhooks({ db, enqueue }, { trigger: "BOOKING_CREATED", bookingId: "b1" });
    const handler = createWebhookDeliverHandler({ db, cipher, allowPrivate: true });
    respondWith = 500;

    await expect(handler([job(ids[0], 0)])).rejects.toThrow(/HTTP 500/);
    expect(await delivery(ids[0])).toMatchObject({ status: "pending", attempts: 1, responseStatus: 500, error: "HTTP 500" });
    await expect(handler([job(ids[0], 10, 10)])).resolves.toBeUndefined();
    expect(await delivery(ids[0])).toMatchObject({ status: "failed", attempts: 2, responseStatus: 500 });
  });

  it("records network errors and does not follow redirects", async () => {
    await hook("u1", "http://127.0.0.1:1/closed", null, ["BOOKING_CREATED"]);
    const { ids, enqueue } = collector();
    await emitWebhooks({ db, enqueue }, { trigger: "BOOKING_CREATED", bookingId: "b1" });
    const handler = createWebhookDeliverHandler({ db, cipher, allowPrivate: true });
    await expect(handler([job(ids[0])])).rejects.toThrow(/Request failed/);
    expect(await delivery(ids[0])).toMatchObject({ status: "pending", attempts: 1, responseStatus: null });

    await db.update(webhook).set({ url: `${base}/redirect` });
    respondWith = 302;
    await handler([job(ids[0])]);
    expect(await delivery(ids[0])).toMatchObject({ status: "failed", error: "Too many redirects" });
    expect(received).toHaveLength(1);
  });
});

describe("SSRF protection (API-004)", () => {
  it("refuses private targets at delivery time unless allowed", async () => {
    await hook("u1", `${base}/hook`, null, ["BOOKING_CREATED"]);
    const { ids, enqueue } = collector();
    await emitWebhooks({ db, enqueue }, { trigger: "BOOKING_CREATED", bookingId: "b1" });
    await createWebhookDeliverHandler({ db, cipher, allowPrivate: false })([job(ids[0])]);
    expect(received).toHaveLength(0);
    expect(await delivery(ids[0])).toMatchObject({ status: "failed", attempts: 1 });
    expect((await delivery(ids[0])).error).toMatch(/not allowed/);
  });

  it("validates URLs on save", async () => {
    const resolve = async (host: string) => (host === "internal.example.com" ? ["10.0.0.5"] : ["93.184.216.34"]);
    expect(await checkWebhookUrl("https://hooks.example.com/x", { allowPrivate: false, resolve })).toEqual({ ok: true, url: "https://hooks.example.com/x" });
    expect(await checkWebhookUrl("https://internal.example.com/x", { allowPrivate: false, resolve })).toMatchObject({ ok: false });
    expect(await checkWebhookUrl("https://127.0.0.1/x", { allowPrivate: false, resolve })).toMatchObject({ ok: false });
    expect(await checkWebhookUrl("https://[::1]/x", { allowPrivate: false, resolve })).toMatchObject({ ok: false });
    expect(await checkWebhookUrl("http://hooks.example.com/x", { allowPrivate: false, resolve })).toEqual({ ok: false, message: "Use an https:// address" });
    expect(await checkWebhookUrl("https://u:p@hooks.example.com/", { allowPrivate: false, resolve })).toMatchObject({ ok: false });
    expect(await checkWebhookUrl("http://192.168.1.10:5678/hook", { allowPrivate: true })).toMatchObject({ ok: true });
    expect(await checkWebhookUrl("ftp://hooks.example.com", { allowPrivate: true })).toMatchObject({ ok: false });
    expect(await checkWebhookUrl("https://unresolvable.example", { allowPrivate: false, resolve: async () => [] })).toMatchObject({ ok: false });
  });
});

describe("ping, redeliver and secrets", () => {
  it("sends a PING to one subscription, even when paused", async () => {
    const created = await hook("u1", `${base}/hook`, "et2", ["BOOKING_CANCELLED"]);
    await updateWebhook(db, "u1", created.id, { active: false });
    const { ids, enqueue } = collector();
    const id = await emitPing({ db, enqueue }, created.id, "u1");
    expect(ids).toEqual([id]);
    await createWebhookDeliverHandler({ db, cipher, allowPrivate: true })([job(id)]);
    expect(received[0].headers["x-opencalendar-event"]).toBe("PING");
    expect(JSON.parse(received[0].body)).toMatchObject({ version: 1, trigger: "PING", payload: { ping: true, webhookId: created.id } });
    await expect(emitPing({ db, enqueue }, created.id, "u2")).rejects.toBeInstanceOf(WebhookError);
  });

  it("re-enqueues failed deliveries for their owner only", async () => {
    const created = await hook("u1", `${base}/hook`, null, ["BOOKING_CREATED"]);
    const { ids, enqueue } = collector();
    await emitWebhooks({ db, enqueue }, { trigger: "BOOKING_CREATED", bookingId: "b1" });
    const handler = createWebhookDeliverHandler({ db, cipher, allowPrivate: true });
    respondWith = 503;
    await handler([job(ids[0], 10, 10)]);
    expect((await delivery(ids[0])).status).toBe("failed");

    await expect(redeliver({ db, enqueue }, "u2", ids[0])).rejects.toMatchObject({ code: "NOT_FOUND" });
    await redeliver({ db, enqueue }, "u1", ids[0]);
    expect(ids).toEqual([ids[0], ids[0]]);
    expect(await delivery(ids[0])).toMatchObject({ status: "pending", error: null });
    await expect(redeliver({ db, enqueue }, "u1", ids[0])).rejects.toMatchObject({ code: "NOT_RETRYABLE" });

    respondWith = 204;
    await handler([job(ids[0], 0)]);
    expect(await delivery(ids[0])).toMatchObject({ status: "success", attempts: 2, responseStatus: 204 });
    const log = await listDeliveries(db, "u1", created.id);
    expect(log).toHaveLength(1);
    expect(await listDeliveries(db, "u2", created.id)).toHaveLength(0);
  });

  it("stores the secret encrypted and rolls it", async () => {
    const created = await hook("u1", `${base}/hook`, null, ["BOOKING_CREATED"]);
    expect(created.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    const [row] = await db.select().from(webhook).where(eq(webhook.id, created.id));
    expect(row.encryptedSecret).not.toContain(created.secret);
    expect(cipher.decrypt(row.encryptedSecret, created.id)).toBe(created.secret);
    const next = await rollWebhookSecret(db, cipher, "u1", created.id);
    expect(next).not.toBe(created.secret);
    await expect(rollWebhookSecret(db, cipher, "u2", created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(hook("u1", `${base}/x`, "et3", ["BOOKING_CREATED"])).rejects.toMatchObject({ code: "EVENT_TYPE_NOT_FOUND" });
  });
});

describe("MEETING_ENDED and no-show triggers (API-001)", () => {
  it("MEETING_ENDED is produced by the booking-ended job handler", async () => {
    const { id } = await hook("u1", `${base}/ended`, null, ["MEETING_ENDED"]);
    await hook("u1", `${base}/created-only`, null, ["BOOKING_CREATED"]);
    const { ids, enqueue } = collector();
    const expectedEnd = START.getTime() + 30 * 60_000;
    const handler = createBookingEndedHandler({ db, enqueueDelivery: enqueue });
    await handler([{ id: "j1", data: { bookingId: "b1", expectedEnd } }]);
    await handler([{ id: "j2", data: { bookingId: "b1", expectedEnd: expectedEnd + 1 } }]); // moved: skipped
    const rows = await db.select().from(webhookDelivery);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ webhookId: id, trigger: "MEETING_ENDED" });
    expect(ids).toEqual([rows[0].id]);
  });

  it("BOOKING_NO_SHOW_UPDATED reflects the new flag after setNoShow", async () => {
    const { id } = await hook("u1", `${base}/noshow`, null, ["BOOKING_NO_SHOW_UPDATED"]);
    await db.insert(bookingHost).values({ bookingId: "b1", userId: "u1", blockedStart: START, blockedEnd: new Date(START.getTime() + 30 * 60_000) });
    await setNoShow(db, { bookingId: "b1", hostId: "u1", target: "host", noShow: true, now: START.getTime() + 60 * 60_000 });
    const { enqueue } = collector();
    expect(await emitWebhooks({ db, enqueue }, { trigger: "BOOKING_NO_SHOW_UPDATED", bookingId: "b1" })).toBe(1);
    const [row] = await db.select().from(webhookDelivery);
    expect(row.webhookId).toBe(id);
    expect(webhookEnvelopeSchema.parse(row.payload).payload).toMatchObject({ booking: { noShow: { host: true } } });
  });
});

describe("team webhooks (API-001)", () => {
  const TEAM_TRIGGERS = ["BOOKING_CREATED", "FORM_SUBMITTED"] as const;
  let acme = "";
  let other = "";

  const teamHook = (userId: string, teamId: string, url = `${base}/team`) => createTeamWebhook(db, cipher, userId, teamId, { url, triggers: [...TEAM_TRIGGERS] });
  const book = (id: string, eventTypeId: string, organizerId: string) =>
    db.insert(booking).values({
      id,
      uid: `uid-${id}`,
      manageTokenHash: `h-${id}`,
      icalUid: `ical-${id}`,
      eventTypeId,
      organizerId,
      status: "accepted",
      title: id,
      startAt: START,
      endAt: new Date(START.getTime() + 30 * 60_000),
      timeZone: "UTC",
    });
  const emitted = async (bookingId: string) => {
    await db.delete(webhookDelivery);
    const { enqueue } = collector();
    await emitWebhooks({ db, enqueue }, { trigger: "BOOKING_CREATED", bookingId });
    return (await db.select().from(webhookDelivery)).map((r) => r.webhookId).sort();
  };

  beforeEach(async () => {
    acme = await world(db);
    other = await createTeam(db, "eve", { name: "Other", slug: "other", logoUrl: null, brandColor: null });
    await db.insert(eventType).values([
      { id: "et-acme", ownerUserId: "ada", teamId: acme, schedulingType: "collective", title: "Acme call", slug: "call", durationMinutes: 30 },
      { id: "et-other", ownerUserId: "eve", teamId: other, schedulingType: "collective", title: "Other call", slug: "call", durationMinutes: 30 },
      { id: "et-tpl", ownerUserId: "ada", teamId: acme, schedulingType: "managed", title: "Template", slug: "tpl", durationMinutes: 30 },
      { id: "et-copy", ownerUserId: "cy", parentId: "et-tpl", title: "Template", slug: "tpl", durationMinutes: 30 },
      { id: "et-own", ownerUserId: "cy", title: "Mine", slug: "mine", durationMinutes: 30 },
    ]);
  });

  it("fires for the team's event types and managed copies, never for another team", async () => {
    const a = await teamHook("bob", acme);
    const o = await teamHook("eve", other);
    const personal = await hook("cy", `${base}/cy`, null, ["BOOKING_CREATED"]);
    await book("b-acme", "et-acme", "cy");
    await book("b-other", "et-other", "cy");
    await book("b-copy", "et-copy", "cy");
    await book("b-own", "et-own", "cy");

    expect(await emitted("b-acme")).toEqual([a.id]);
    expect(await emitted("b-other")).toEqual([o.id]);
    expect(await emitted("b-copy")).toEqual([a.id, personal.id].sort());
    expect(await emitted("b-own")).toEqual([personal.id]);
  });

  it("does not fire personal webhooks for team bookings, even event-type scoped ones", async () => {
    await hook("cy", `${base}/all`, null, ["BOOKING_CREATED"]);
    await hook("cy", `${base}/own`, "et-own", ["BOOKING_CREATED"]);
    await book("b-acme", "et-acme", "cy");
    expect(await emitted("b-acme")).toEqual([]);
  });

  it("lets only live admins and owners manage them", async () => {
    const { id } = await teamHook("bob", acme);
    const pending = collector();
    const emit = { db, enqueue: pending.enqueue };
    const calls = (userId: string) => ({
      list: code(listTeamWebhooks(db, userId, acme)),
      create: code(teamHook(userId, acme)),
      update: code(updateTeamWebhook(db, userId, acme, id, { triggers: ["MEETING_ENDED"] })),
      toggle: code(toggleTeamWebhook(db, userId, acme, id, false)),
      roll: code(rollTeamWebhookSecret(db, cipher, userId, acme, id)),
      deliveries: code(listTeamDeliveries(db, userId, acme, id)),
      ping: code(emitTeamPing(emit, userId, acme, id)),
      remove: code(deleteTeamWebhook(db, userId, acme, id)),
    });
    for (const [userId, expected] of [["cy", "FORBIDDEN"], ["eve", "NOT_FOUND"]] as const) {
      const results = await Promise.all(Object.values(calls(userId)));
      expect(new Set(results)).toEqual(new Set([expected]));
    }
    expect(await db.$count(webhookDelivery)).toBe(0);
    expect(await listTeamWebhooks(db, "ada", acme)).toHaveLength(1); // owner
    expect(await listTeamWebhooks(db, "bob", acme)).toHaveLength(1); // admin
  });

  it("revokes access from a creator who is demoted or removed", async () => {
    const { id } = await teamHook("bob", acme);
    await db.execute(sql`UPDATE "membership" SET "role" = 'member' WHERE "user_id" = 'bob'`);
    expect(await code(toggleTeamWebhook(db, "bob", acme, id, false))).toBe("FORBIDDEN");
    await db.execute(sql`DELETE FROM "membership" WHERE "user_id" = 'bob'`);
    expect(await code(deleteTeamWebhook(db, "bob", acme, id))).toBe("NOT_FOUND");
    expect(await db.$count(webhook)).toBe(1);
  });

  it("keeps the personal and team paths apart, and teams apart from each other", async () => {
    const { id } = await teamHook("bob", acme);
    const mine = await hook("bob", `${base}/mine`, null, ["BOOKING_CREATED"]);
    const notFound = async (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ name: "WebhookError", code: "NOT_FOUND" });
    // The creator cannot reach the team webhook through the personal path.
    expect((await listWebhooks(db, "bob")).map((w) => w.id)).toEqual([mine.id]);
    await notFound(updateWebhook(db, "bob", id, { active: false }));
    await notFound(deleteWebhook(db, "bob", id));
    await notFound(rollWebhookSecret(db, cipher, "bob", id));
    await notFound(emitPing({ db, enqueue: async () => {} }, id, "bob"));
    expect(await listDeliveries(db, "bob", id)).toEqual([]);
    // The team path does not reach personal webhooks or another team's webhooks.
    await notFound(deleteTeamWebhook(db, "bob", acme, mine.id));
    await notFound(updateTeamWebhook(db, "eve", other, id, { active: false }));
    await notFound(emitTeamPing({ db, enqueue: async () => {} }, "eve", other, id));
    expect(await db.$count(webhook)).toBe(2);
  });

  it("pings and redelivers for admins only", async () => {
    const { id } = await teamHook("bob", acme);
    const { ids, enqueue } = collector();
    const pingId = await emitTeamPing({ db, enqueue }, "bob", acme, id);
    expect(ids).toEqual([pingId]);
    expect((await listTeamDeliveries(db, "bob", acme, id)).map((d) => d.trigger)).toEqual(["PING"]);
    await db.update(webhookDelivery).set({ status: "failed" }).where(eq(webhookDelivery.id, pingId));
    expect(await code(redeliverTeam({ db, enqueue }, "cy", acme, pingId))).toBe("FORBIDDEN");
    expect(await code(redeliverTeam({ db, enqueue }, "eve", other, pingId))).toBe("NOT_FOUND"); // wrong team
    await redeliverTeam({ db, enqueue }, "bob", acme, pingId);
    expect(ids).toEqual([pingId, pingId]);
    await expect(redeliver({ db, enqueue }, "bob", pingId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  describe("FORM_SUBMITTED", () => {
    const formInput = () =>
      routingFormSchema.parse({
        name: "Contact",
        fields: [{ key: "company", label: "Company", type: "text", required: false }],
        rules: [],
        fallback: { kind: "message", message: "Thanks" },
      });

    it("creates deliveries for a personal form's owner", async () => {
      const mine = await hook("cy", `${base}/f`, null, ["FORM_SUBMITTED"]);
      await hook("cy", `${base}/scoped`, "et-own", ["FORM_SUBMITTED"]);
      await hook("dee", `${base}/dee`, null, ["FORM_SUBMITTED"]);
      await hook("cy", `${base}/created`, null, ["BOOKING_CREATED"]);
      await teamHook("bob", acme);
      const formId = await createForm(db, "cy", null, formInput());
      const { ids, enqueue } = collector();
      const { responseId } = await submitResponse(db, formId, { company: "Acme" }, { enqueueDelivery: enqueue });

      const rows = await db.select().from(webhookDelivery);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ webhookId: mine.id, trigger: "FORM_SUBMITTED" });
      expect(ids).toEqual([rows[0].id]);
      const envelope = webhookEnvelopeSchema.parse(rows[0].payload);
      expect(envelope).toMatchObject({ version: 1, trigger: "FORM_SUBMITTED" });
      expect(envelope.payload).toMatchObject({
        form: { id: formId, name: "Contact" },
        response: { id: responseId, answers: { company: "Acme" }, matchedRuleId: null, action: { kind: "message", message: "Thanks" } },
      });
    });

    it("creates deliveries for a team form's team webhooks only", async () => {
      const t = await teamHook("bob", acme);
      await teamHook("eve", other);
      await hook("bob", `${base}/personal`, null, ["FORM_SUBMITTED"]);
      const formId = await createForm(db, "bob", acme, formInput());
      const { enqueue } = collector();
      await submitResponse(db, formId, { company: "Acme" }, { enqueueDelivery: enqueue });
      const rows = await db.select().from(webhookDelivery);
      expect(rows.map((r) => r.webhookId)).toEqual([t.id]);
      expect(rows[0].trigger).toBe("FORM_SUBMITTED");
    });

    it("never fails the visitor when enqueueing fails", async () => {
      await hook("cy", `${base}/f`, null, ["FORM_SUBMITTED"]);
      const formId = await createForm(db, "cy", null, formInput());
      const { target } = await submitResponse(db, formId, {}, { enqueueDelivery: async () => Promise.reject(new Error("queue down")) });
      expect(target).toEqual({ kind: "message", message: "Thanks" });
    });
  });
});
