import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { eventType, webhook, webhookDelivery } from "@/db/schema";
import type { Cipher } from "@/lib/crypto/encryption";
import { SUBSCRIBABLE_TRIGGERS } from "../payload";
import { WebhookError } from "./errors";

/**
 * Scope-generic webhook queries (API-001). A subscription is either personal (`team_id IS NULL`,
 * owned by a user) or belongs to a team. Every statement here filters by the scope, so an id from
 * the other scope is simply NOT_FOUND. Authorization (who may act on a scope) is the caller's job:
 * `service.ts` for the personal scope, `team-service.ts` for teams.
 */

export type WebhookScope = { kind: "user"; userId: string } | { kind: "team"; teamId: string };

export const RECENT_DELIVERIES = 20;

export const triggersSchema = z.array(z.enum(SUBSCRIBABLE_TRIGGERS)).min(1, "Choose at least one trigger").max(SUBSCRIBABLE_TRIGGERS.length);

export type WebhookPatch = { active?: boolean; triggers?: string[] };

/** `whsec_` + 32 random bytes (base64url). Shown once; stored encrypted. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export const sealSecret = (cipher: Cipher, webhookId: string, secret: string): string => cipher.encrypt(secret, webhookId);
export const openSecret = (cipher: Cipher, webhookId: string, sealed: string): string => cipher.decrypt(sealed, webhookId);

export function inScope(scope: WebhookScope): SQL {
  return scope.kind === "user" ? and(eq(webhook.ownerUserId, scope.userId), isNull(webhook.teamId))! : eq(webhook.teamId, scope.teamId);
}

export async function countIn(db: Database, scope: WebhookScope): Promise<number> {
  return db.$count(webhook, inScope(scope));
}

export async function listIn(db: Database, scope: WebhookScope) {
  return db
    .select({
      id: webhook.id,
      url: webhook.url,
      eventTypeId: webhook.eventTypeId,
      eventTypeTitle: eventType.title,
      triggers: webhook.triggers,
      active: webhook.active,
      payloadVersion: webhook.payloadVersion,
      createdAt: webhook.createdAt,
    })
    .from(webhook)
    .leftJoin(eventType, eq(eventType.id, webhook.eventTypeId))
    .where(inScope(scope))
    .orderBy(asc(webhook.createdAt));
}

export type WebhookSummary = Awaited<ReturnType<typeof listIn>>[number];

export async function updateIn(db: Database, scope: WebhookScope, id: string, patch: WebhookPatch): Promise<void> {
  const set = {
    ...(patch.active === undefined ? {} : { active: patch.active }),
    ...(patch.triggers === undefined ? {} : { triggers: [...triggersSchema.parse(patch.triggers)] }),
  };
  if (Object.keys(set).length === 0) return;
  const updated = await db.update(webhook).set(set).where(and(eq(webhook.id, id), inScope(scope))).returning({ id: webhook.id });
  if (updated.length === 0) throw new WebhookError("NOT_FOUND");
}

export async function deleteIn(db: Database, scope: WebhookScope, id: string): Promise<void> {
  const deleted = await db.delete(webhook).where(and(eq(webhook.id, id), inScope(scope))).returning({ id: webhook.id });
  if (deleted.length === 0) throw new WebhookError("NOT_FOUND");
}

export async function rollSecretIn(db: Database, cipher: Cipher, scope: WebhookScope, id: string): Promise<string> {
  const secret = generateWebhookSecret();
  const updated = await db
    .update(webhook)
    .set({ encryptedSecret: sealSecret(cipher, id, secret) })
    .where(and(eq(webhook.id, id), inScope(scope)))
    .returning({ id: webhook.id });
  if (updated.length === 0) throw new WebhookError("NOT_FOUND");
  return secret;
}

export async function findIn(db: Database, scope: WebhookScope, id: string) {
  const [row] = await db.select().from(webhook).where(and(eq(webhook.id, id), inScope(scope)));
  return row ?? null;
}

export async function listDeliveriesIn(db: Database, scope: WebhookScope, webhookId: string, limit = RECENT_DELIVERIES) {
  return db
    .select({
      id: webhookDelivery.id,
      trigger: webhookDelivery.trigger,
      status: webhookDelivery.status,
      attempts: webhookDelivery.attempts,
      responseStatus: webhookDelivery.responseStatus,
      latencyMs: webhookDelivery.latencyMs,
      error: webhookDelivery.error,
      createdAt: webhookDelivery.createdAt,
      updatedAt: webhookDelivery.updatedAt,
    })
    .from(webhookDelivery)
    .innerJoin(webhook, eq(webhook.id, webhookDelivery.webhookId))
    .where(and(eq(webhookDelivery.webhookId, webhookId), inScope(scope)))
    .orderBy(desc(webhookDelivery.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export type DeliverySummary = Awaited<ReturnType<typeof listDeliveriesIn>>[number];

/** Puts a failed delivery of this scope back to pending; the caller enqueues the job. */
export async function resetDeliveryIn(db: Database, scope: WebhookScope, deliveryId: string): Promise<string> {
  const [row] = await db
    .select({ id: webhookDelivery.id, status: webhookDelivery.status })
    .from(webhookDelivery)
    .innerJoin(webhook, eq(webhook.id, webhookDelivery.webhookId))
    .where(and(eq(webhookDelivery.id, deliveryId), inScope(scope)));
  if (!row) throw new WebhookError("NOT_FOUND");
  if (row.status !== "failed") throw new WebhookError("NOT_RETRYABLE");
  const updated = await db
    .update(webhookDelivery)
    .set({ status: "pending", error: null })
    .where(and(eq(webhookDelivery.id, deliveryId), eq(webhookDelivery.status, "failed")))
    .returning({ id: webhookDelivery.id });
  if (updated.length === 0) throw new WebhookError("NOT_RETRYABLE");
  return deliveryId;
}
