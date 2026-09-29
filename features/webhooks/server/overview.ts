import { and, count, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { webhook, webhookDelivery } from "@/db/schema";
import { requireTeamRole } from "@/features/teams/server/access";
import { QUEUES } from "@/lib/jobs/queues";
import type { DeliveryFacts } from "../overview";
import { inScope, listIn, type WebhookScope, type WebhookSummary } from "./scoped";

/**
 * Data for the webhooks page (API-001, API-003): the subscriptions of a scope, each one's latest
 * deliveries (for its health), the scope's recent deliveries across all endpoints and how many of
 * the last 7 days' deliveries succeeded. Every query filters by the scope.
 */

/** pg-boss retries (API-003) plus the first attempt. */
export const MAX_DELIVERY_ATTEMPTS = QUEUES.webhookDeliver.options.retryLimit + 1;
/** Deliveries per webhook used to judge its health and failure streak. */
export const HEALTH_WINDOW = 10;
export const RECENT_SCOPE_DELIVERIES = 30;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type ScopeDelivery = DeliveryFacts & {
  id: string;
  webhookId: string;
  url: string;
  trigger: string;
  latencyMs: number | null;
};

export type WebhookOverview = {
  webhooks: WebhookSummary[];
  /** Webhook id → its latest deliveries, newest first (at most HEALTH_WINDOW). */
  latestByWebhook: Record<string, DeliveryFacts[]>;
  recent: ScopeDelivery[];
  week: { success: number; failed: number };
};

async function latestPerWebhook(db: Database, scope: WebhookScope): Promise<Record<string, DeliveryFacts[]>> {
  const ranked = db
    .select({
      webhookId: webhookDelivery.webhookId,
      status: webhookDelivery.status,
      attempts: webhookDelivery.attempts,
      responseStatus: webhookDelivery.responseStatus,
      error: webhookDelivery.error,
      createdAt: webhookDelivery.createdAt,
      rank: sql<number>`row_number() over (partition by ${webhookDelivery.webhookId} order by ${webhookDelivery.createdAt} desc, ${webhookDelivery.id} desc)`.as("rank"),
    })
    .from(webhookDelivery)
    .innerJoin(webhook, eq(webhook.id, webhookDelivery.webhookId))
    .where(inScope(scope))
    .as("ranked");
  const rows = await db.select().from(ranked).where(lte(ranked.rank, HEALTH_WINDOW)).orderBy(ranked.webhookId, ranked.rank);
  const out: Record<string, DeliveryFacts[]> = {};
  for (const { webhookId, rank: _rank, ...facts } of rows) (out[webhookId] ??= []).push(facts);
  return out;
}

async function recentInScope(db: Database, scope: WebhookScope): Promise<ScopeDelivery[]> {
  return db
    .select({
      id: webhookDelivery.id,
      webhookId: webhookDelivery.webhookId,
      url: webhook.url,
      trigger: webhookDelivery.trigger,
      status: webhookDelivery.status,
      attempts: webhookDelivery.attempts,
      responseStatus: webhookDelivery.responseStatus,
      latencyMs: webhookDelivery.latencyMs,
      error: webhookDelivery.error,
      createdAt: webhookDelivery.createdAt,
    })
    .from(webhookDelivery)
    .innerJoin(webhook, eq(webhook.id, webhookDelivery.webhookId))
    .where(inScope(scope))
    .orderBy(desc(webhookDelivery.createdAt), desc(webhookDelivery.id))
    .limit(RECENT_SCOPE_DELIVERIES);
}

async function weekCounts(db: Database, scope: WebhookScope, now: number): Promise<{ success: number; failed: number }> {
  const rows = await db
    .select({ status: webhookDelivery.status, count: count() })
    .from(webhookDelivery)
    .innerJoin(webhook, eq(webhook.id, webhookDelivery.webhookId))
    .where(and(inScope(scope), gte(webhookDelivery.createdAt, new Date(now - WEEK_MS)), ne(webhookDelivery.status, "pending")))
    .groupBy(webhookDelivery.status);
  const of = (status: "success" | "failed") => rows.find((r) => r.status === status)?.count ?? 0;
  return { success: of("success"), failed: of("failed") };
}

export async function loadWebhookOverview(db: Database, scope: WebhookScope, now: number): Promise<WebhookOverview> {
  const [webhooks, latestByWebhook, recent, week] = await Promise.all([
    listIn(db, scope),
    latestPerWebhook(db, scope),
    recentInScope(db, scope),
    weekCounts(db, scope, now),
  ]);
  return { webhooks, latestByWebhook, recent, week };
}

/** The signed-in user's personal webhooks (`team_id IS NULL`). */
export const personalWebhookOverview = (db: Database, userId: string, now: number): Promise<WebhookOverview> =>
  loadWebhookOverview(db, { kind: "user", userId }, now);

/** A team's webhooks; admins and owners only (TeamError otherwise). */
export async function teamWebhookOverview(db: Database, userId: string, teamId: string, now: number): Promise<WebhookOverview> {
  await requireTeamRole(db, userId, teamId, "admin");
  return loadWebhookOverview(db, { kind: "team", teamId }, now);
}
