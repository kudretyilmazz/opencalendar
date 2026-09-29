import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { webhook, webhookDelivery } from "@/db/schema";
import type { Cipher } from "@/lib/crypto/encryption";
import { IntegrationError } from "@/lib/integrations/errors";
import { createSafeFetch } from "@/lib/integrations/safe-fetch";
import type { FetchLike } from "@/lib/integrations/types";
import { webhookDeliverPayload } from "@/lib/jobs/queues";
import { logger } from "@/lib/logger";
import { DELIVERY_HEADER, EVENT_HEADER, SIGNATURE_HEADER, signatureHeader, WEBHOOK_USER_AGENT } from "../signature";
import { openSecret } from "./service";

export const DELIVERY_TIMEOUT_MS = 10_000;
/** Only the status matters; larger response bodies are refused by the safe fetch. */
export const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_ERROR_LENGTH = 300;

export type WebhookDeliverDeps = {
  db: Database;
  cipher: Cipher;
  /** Defaults to the SSRF-safe fetch (no redirects, 10 s timeout, capped response). */
  fetch?: FetchLike;
  /** WEBHOOK_ALLOW_PRIVATE: permits private/loopback targets (API-004). */
  allowPrivate: boolean;
  now?: () => number;
};

/** The pg-boss job fields this handler reads (`includeMetadata: true` supplies the retry counts). */
export type WebhookDeliverJob = { id: string; data: unknown; retryCount?: number; retryLimit?: number };

/** Thrown so pg-boss retries the job with exponential backoff. */
export class WebhookDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookDeliveryError";
  }
}

type Attempt = { ok: true; status: number } | { ok: false; status: number | null; error: string; permanent: boolean };

async function attempt(fetchFn: FetchLike, url: string, headers: Record<string, string>, body: string): Promise<Attempt> {
  try {
    const response = await fetchFn(url, { method: "POST", headers, body });
    await response.body?.cancel().catch(() => undefined);
    if (response.status >= 200 && response.status < 300) return { ok: true, status: response.status };
    return { ok: false, status: response.status, error: `HTTP ${response.status}`, permanent: false };
  } catch (error) {
    if (error instanceof IntegrationError) {
      // "invalid": blocked address, redirect, oversized response — retrying won't help.
      return { ok: false, status: null, error: error.message, permanent: error.kind === "invalid" };
    }
    return { ok: false, status: null, error: `Request failed (${error instanceof Error ? error.name : "Error"})`, permanent: false };
  }
}

/**
 * Consumer for `webhook.deliver` (API-003): signs and POSTs one stored delivery. 2xx = success;
 * non-2xx or network errors throw so pg-boss retries with backoff, and the last attempt marks
 * the delivery failed. Deliveries already marked successful are skipped (at-least-once jobs).
 */
export function createWebhookDeliverHandler(deps: WebhookDeliverDeps) {
  const now = deps.now ?? Date.now;
  const fetchFn =
    deps.fetch ?? createSafeFetch({ allowPrivate: deps.allowPrivate, timeoutMs: DELIVERY_TIMEOUT_MS, maxBytes: MAX_RESPONSE_BYTES, maxRedirects: 0 });

  return async (jobs: WebhookDeliverJob[]): Promise<void> => {
    for (const job of jobs) {
      const { deliveryId } = webhookDeliverPayload.parse(job.data);
      const [row] = await deps.db
        .select({ delivery: webhookDelivery, hook: webhook })
        .from(webhookDelivery)
        .innerJoin(webhook, eq(webhook.id, webhookDelivery.webhookId))
        .where(eq(webhookDelivery.id, deliveryId));
      if (!row) {
        logger.warn("webhook.delivery_missing", { jobId: job.id });
        continue;
      }
      const { delivery, hook } = row;
      if (delivery.status === "success") continue;
      if (!hook.active && delivery.trigger !== "PING") {
        await deps.db.update(webhookDelivery).set({ status: "failed", error: "Webhook is disabled" }).where(eq(webhookDelivery.id, deliveryId));
        continue;
      }

      const body = JSON.stringify(delivery.payload);
      const timestamp = Math.floor(now() / 1000);
      const headers = {
        "content-type": "application/json",
        "user-agent": WEBHOOK_USER_AGENT,
        [EVENT_HEADER]: delivery.trigger,
        [DELIVERY_HEADER]: delivery.id,
        [SIGNATURE_HEADER]: signatureHeader(openSecret(deps.cipher, hook.id, hook.encryptedSecret), timestamp, body),
      };
      const started = now();
      const result = await attempt(fetchFn, hook.url, headers, body);
      const latencyMs = Math.max(0, Math.round(now() - started));
      const lastAttempt = (job.retryCount ?? 0) >= (job.retryLimit ?? 0);

      if (result.ok) {
        await deps.db
          .update(webhookDelivery)
          .set({ status: "success", attempts: sql`${webhookDelivery.attempts} + 1`, responseStatus: result.status, latencyMs, error: null })
          .where(eq(webhookDelivery.id, deliveryId));
        logger.info("webhook.delivered", { deliveryId, status: result.status, latencyMs });
        continue;
      }

      const final = result.permanent || lastAttempt;
      await deps.db
        .update(webhookDelivery)
        .set({
          status: final ? "failed" : "pending",
          attempts: sql`${webhookDelivery.attempts} + 1`,
          responseStatus: result.status,
          latencyMs,
          error: result.error.slice(0, MAX_ERROR_LENGTH),
        })
        .where(eq(webhookDelivery.id, deliveryId));
      logger.warn("webhook.delivery_failed", { deliveryId, status: result.status, final, permanent: result.permanent });
      if (!final) throw new WebhookDeliveryError(result.error);
    }
  };
}
