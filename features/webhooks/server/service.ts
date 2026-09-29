import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { eventType, webhook } from "@/db/schema";
import { personalOf } from "@/features/event-types/server/service";
import type { Cipher } from "@/lib/crypto/encryption";
import { newId } from "@/lib/ids";
import {
  countIn,
  deleteIn,
  findIn,
  listDeliveriesIn,
  listIn,
  resetDeliveryIn,
  rollSecretIn,
  sealSecret,
  triggersSchema,
  updateIn,
  generateWebhookSecret,
  type WebhookPatch,
  type WebhookScope,
} from "./scoped";
import { WebhookError } from "./errors";

/**
 * Personal webhook subscriptions and their delivery log (API-001, API-003), always scoped by
 * owner and `team_id IS NULL`: a user cannot manage a team webhook through this path, not even
 * one they created. Team webhooks live in `team-service.ts`.
 */

export { WebhookError, type WebhookErrorCode } from "./errors";
export { generateWebhookSecret, openSecret, RECENT_DELIVERIES, sealSecret, triggersSchema, type DeliverySummary, type WebhookPatch, type WebhookSummary } from "./scoped";

export const MAX_WEBHOOKS_PER_USER = 25;

export const webhookInputSchema = z.object({
  url: z.string().trim().url("Enter a valid URL").max(2048),
  eventTypeId: z.string().min(1).max(64).nullable(),
  triggers: triggersSchema,
});

export type WebhookInput = z.infer<typeof webhookInputSchema>;

const scopeOf = (userId: string): WebhookScope => ({ kind: "user", userId });

export async function listOwnerEventTypes(db: Database, ownerId: string) {
  return db.select({ id: eventType.id, title: eventType.title }).from(eventType).where(personalOf(ownerId)).orderBy(asc(eventType.position), asc(eventType.title));
}

async function assertEventType(db: Database, ownerId: string, eventTypeId: string | null): Promise<void> {
  if (!eventTypeId) return;
  const [row] = await db.select({ id: eventType.id }).from(eventType).where(and(eq(eventType.id, eventTypeId), personalOf(ownerId)));
  if (!row) throw new WebhookError("EVENT_TYPE_NOT_FOUND");
}

export const listWebhooks = (db: Database, ownerId: string) => listIn(db, scopeOf(ownerId));

export async function createWebhook(db: Database, cipher: Cipher, ownerId: string, input: WebhookInput): Promise<{ id: string; secret: string }> {
  const data = webhookInputSchema.parse(input);
  await assertEventType(db, ownerId, data.eventTypeId);
  if ((await countIn(db, scopeOf(ownerId))) >= MAX_WEBHOOKS_PER_USER) throw new WebhookError("LIMIT_REACHED");
  const id = newId();
  const secret = generateWebhookSecret();
  await db.insert(webhook).values({
    id,
    ownerUserId: ownerId,
    eventTypeId: data.eventTypeId,
    url: data.url,
    encryptedSecret: sealSecret(cipher, id, secret),
    triggers: [...data.triggers],
  });
  return { id, secret };
}

export const updateWebhook = (db: Database, ownerId: string, id: string, patch: WebhookPatch): Promise<void> => updateIn(db, scopeOf(ownerId), id, patch);

export const deleteWebhook = (db: Database, ownerId: string, id: string): Promise<void> => deleteIn(db, scopeOf(ownerId), id);

/** Replaces the signing secret; the new one is returned once. */
export const rollWebhookSecret = (db: Database, cipher: Cipher, ownerId: string, id: string): Promise<string> => rollSecretIn(db, cipher, scopeOf(ownerId), id);

export const findOwnedWebhook = (db: Database, ownerId: string, id: string) => findIn(db, scopeOf(ownerId), id);

export const listDeliveries = (db: Database, ownerId: string, webhookId: string, limit?: number) => listDeliveriesIn(db, scopeOf(ownerId), webhookId, limit);

/** Puts a failed delivery back to pending so it can be re-enqueued (manual retry). */
export const resetDeliveryForRetry = (db: Database, ownerId: string, deliveryId: string): Promise<string> => resetDeliveryIn(db, scopeOf(ownerId), deliveryId);

/** Manual retry (API-003): resets the delivery and enqueues a fresh job for it. */
export async function redeliver(deps: { db: Database; enqueue(deliveryId: string): Promise<void> }, ownerId: string, deliveryId: string): Promise<void> {
  await resetDeliveryForRetry(deps.db, ownerId, deliveryId);
  await deps.enqueue(deliveryId);
}
