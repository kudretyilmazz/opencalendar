import { and, arrayContains, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import { booking, eventType, webhook, webhookDelivery } from "@/db/schema";
import { findBookingById } from "@/features/bookings/server/service";
import { requireTeamRole } from "@/features/teams/server/access";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { buildBookingPayload, buildEnvelope, type BookingPayload, type FormSubmittedPayload, type WebhookTrigger } from "../payload";
import { stableId } from "./delivery-ids";
import { WebhookError } from "./errors";
import { findIn } from "./scoped";

export type EmitDeps = {
  db: Database;
  /** Enqueues `webhook.deliver` for one delivery; `db` lets callers enqueue inside their transaction. */
  enqueue(deliveryId: string, db?: unknown): Promise<void>;
  now?: () => number;
};

export type EmitInput = {
  trigger: WebhookTrigger;
  bookingId: string;
  /**
   * Optional idempotency key for the event (e.g. `${bookingId}:created`). When set, delivery ids
   * are derived from it, so a retried producer job does not create duplicate deliveries.
   */
  eventKey?: string;
};

async function previousUid(db: Database, id: string | null): Promise<string | undefined> {
  if (!id) return undefined;
  const [row] = await db.select({ uid: booking.uid }).from(booking).where(eq(booking.id, id));
  return row?.uid;
}

/** Team ids whose webhooks cover an event type: its own team, or the template's team for a managed copy. */
async function teamsOf(db: Database, eventTypeId: string): Promise<{ isTeamEventType: boolean; teamIds: string[] }> {
  const [et] = await db.select({ teamId: eventType.teamId, parentId: eventType.parentId }).from(eventType).where(eq(eventType.id, eventTypeId));
  const [parent] = et?.parentId ? await db.select({ teamId: eventType.teamId }).from(eventType).where(eq(eventType.id, et.parentId)) : [];
  return { isTeamEventType: Boolean(et?.teamId), teamIds: [et?.teamId, parent?.teamId].filter((t): t is string => Boolean(t)) };
}

/** Inserts one delivery per subscription and enqueues each; ids derive from `eventKey` when given. */
export async function queueDeliveries(
  deps: EmitDeps,
  subscriptions: readonly { id: string }[],
  trigger: WebhookTrigger,
  payload: BookingPayload | FormSubmittedPayload,
  eventKey?: string,
): Promise<{ id: string }[]> {
  const createdAt = new Date((deps.now ?? Date.now)());
  const rows = subscriptions.map((sub) => {
    const id = eventKey ? stableId(`${eventKey}:${trigger}:${sub.id}`) : newId();
    return { id, webhookId: sub.id, trigger, payload: buildEnvelope({ id, trigger, createdAt, payload }) };
  });
  await deps.db.insert(webhookDelivery).values(rows).onConflictDoNothing({ target: webhookDelivery.id });
  // Enqueue every row, also ones that already existed: the worker skips delivered ones.
  for (const row of rows) await deps.enqueue(row.id);
  return rows;
}

/**
 * Scope rules (API-001):
 * - Personal webhooks (`team_id IS NULL`) cover the organizer's own, non-team event types (all of
 *   them, or the one they are scoped to). A booking of a team event type never reaches the host's
 *   personal webhooks; it goes to the team's webhooks only. A managed copy is the member's own
 *   event type, so their personal webhooks fire for it as well as the template team's.
 * - Team webhooks cover bookings of the team's event types and of managed copies whose parent
 *   template belongs to the team.
 */
async function bookingSubscriptions(db: Database, organizerId: string, eventTypeId: string, trigger: WebhookTrigger): Promise<{ id: string }[]> {
  const { isTeamEventType, teamIds } = await teamsOf(db, eventTypeId);
  const scopes: SQL[] = [];
  if (!isTeamEventType) {
    scopes.push(and(eq(webhook.ownerUserId, organizerId), isNull(webhook.teamId), or(isNull(webhook.eventTypeId), eq(webhook.eventTypeId, eventTypeId)))!);
  }
  if (teamIds.length > 0) scopes.push(inArray(webhook.teamId, teamIds));
  if (scopes.length === 0) return [];
  return db
    .select({ id: webhook.id })
    .from(webhook)
    .where(and(eq(webhook.active, true), arrayContains(webhook.triggers, [trigger]), or(...scopes)));
}

/**
 * Fans a booking event out to the matching active subscriptions (see `bookingSubscriptions`).
 * Inserts one `webhook_delivery` per subscription with the built payload and enqueues a job for
 * each. Returns the count.
 */
export async function emitWebhooks(deps: EmitDeps, input: EmitInput): Promise<number> {
  if (input.trigger === "PING") throw new Error("Use emitPing for PING deliveries");
  const details = await findBookingById(deps.db, input.bookingId);
  if (!details) {
    logger.warn("webhook.emit_missing_booking", { bookingId: input.bookingId, trigger: input.trigger });
    return 0;
  }
  const subscriptions = await bookingSubscriptions(deps.db, details.booking.organizerId, details.booking.eventTypeId, input.trigger);
  if (subscriptions.length === 0) return 0;

  const payload = buildBookingPayload(details, { rescheduledFromUid: await previousUid(deps.db, details.booking.rescheduledFromId) });
  const rows = await queueDeliveries(deps, subscriptions, input.trigger, payload, input.eventKey);
  logger.info("webhook.emitted", { bookingId: input.bookingId, trigger: input.trigger, count: rows.length });
  return rows.length;
}

async function sendPing(deps: EmitDeps, webhookId: string): Promise<string> {
  const id = newId();
  const envelope = buildEnvelope({ id, trigger: "PING", createdAt: new Date((deps.now ?? Date.now)()), payload: { ping: true, webhookId } });
  await deps.db.insert(webhookDelivery).values({ id, webhookId, trigger: "PING", payload: envelope });
  await deps.enqueue(id);
  return id;
}

/** Sends a PING to one personal subscription (even an inactive one). Returns the delivery id. */
export async function emitPing(deps: EmitDeps, webhookId: string, ownerId: string): Promise<string> {
  const hook = await findIn(deps.db, { kind: "user", userId: ownerId }, webhookId);
  if (!hook) throw new WebhookError("NOT_FOUND");
  return sendPing(deps, webhookId);
}

/** Test ping for a team webhook; needs a live admin role in the team (API-001). */
export async function emitTeamPing(deps: EmitDeps, userId: string, teamId: string, webhookId: string): Promise<string> {
  await requireTeamRole(deps.db, userId, teamId, "admin");
  const hook = await findIn(deps.db, { kind: "team", teamId }, webhookId);
  if (!hook) throw new WebhookError("NOT_FOUND");
  return sendPing(deps, webhookId);
}
