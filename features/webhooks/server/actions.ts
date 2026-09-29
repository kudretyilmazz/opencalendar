"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type ActionState, fieldErrors } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { getEnv } from "@/lib/env";
import { enqueue } from "@/lib/jobs/enqueue";
import { errorSummary, logger } from "@/lib/logger";
import { emitPing } from "./emit";
import { createWebhook, deleteWebhook, redeliver, rollWebhookSecret, triggersSchema, updateWebhook, WebhookError, webhookInputSchema } from "./service";
import { checkWebhookUrl } from "./url";

const PATH = "/settings/webhooks";

/** `secret` is only set right after creating a webhook or rolling its secret (shown once). */
export type WebhookActionState = ActionState & { secret?: string };

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "That webhook no longer exists.",
  EVENT_TYPE_NOT_FOUND: "That event type no longer exists.",
  LIMIT_REACHED: "You have reached the maximum number of webhooks.",
  NOT_RETRYABLE: "Only failed deliveries can be retried.",
};

function failure(error: unknown): WebhookActionState {
  if (error instanceof WebhookError) return { status: "error", message: MESSAGES[error.code] };
  throw error;
}

const enqueueDelivery = async (deliveryId: string) => {
  await enqueue("webhookDeliver", { deliveryId });
};

const idSchema = z.string().min(1).max(64);

export async function createWebhookAction(_prev: WebhookActionState, formData: FormData): Promise<WebhookActionState> {
  const user = await requireUser();
  const parsed = webhookInputSchema.safeParse({
    url: String(formData.get("url") ?? ""),
    eventTypeId: String(formData.get("eventTypeId") ?? "") || null,
    triggers: formData.getAll("triggers").map(String),
  });
  if (!parsed.success) return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const env = getEnv();
  const checked = await checkWebhookUrl(parsed.data.url, { allowPrivate: env.WEBHOOK_ALLOW_PRIVATE });
  if (!checked.ok) return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { url: checked.message } };
  try {
    const { secret } = await createWebhook(getDb(), cipherFromEnv(env), user.id, { ...parsed.data, url: checked.url });
    revalidatePath(PATH);
    return { status: "success", message: "Webhook created. Copy the signing secret now; it won't be shown again.", secret };
  } catch (error) {
    return failure(error);
  }
}

export async function setWebhookActiveAction(id: string, active: boolean): Promise<void> {
  const user = await requireUser();
  await updateWebhook(getDb(), user.id, idSchema.parse(id), { active: Boolean(active) }).catch(failure);
  revalidatePath(PATH);
}

export async function updateTriggersAction(id: string, _prev: WebhookActionState, formData: FormData): Promise<WebhookActionState> {
  const user = await requireUser();
  const parsed = triggersSchema.safeParse(formData.getAll("triggers").map(String));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Choose at least one trigger" };
  try {
    await updateWebhook(getDb(), user.id, idSchema.parse(id), { triggers: parsed.data });
  } catch (error) {
    return failure(error);
  }
  revalidatePath(PATH);
  return { status: "success", message: "Triggers saved." };
}

export async function deleteWebhookAction(id: string): Promise<void> {
  const user = await requireUser();
  await deleteWebhook(getDb(), user.id, idSchema.parse(id)).catch(failure);
  revalidatePath(PATH);
}

export async function rollSecretAction(id: string, _prev: WebhookActionState): Promise<WebhookActionState> {
  const user = await requireUser();
  try {
    const secret = await rollWebhookSecret(getDb(), cipherFromEnv(getEnv()), user.id, idSchema.parse(id));
    return { status: "success", message: "New secret created. Update your receiver; the old secret no longer works.", secret };
  } catch (error) {
    return failure(error);
  }
}

export async function pingWebhookAction(id: string, _prev: WebhookActionState): Promise<WebhookActionState> {
  const user = await requireUser();
  try {
    await emitPing({ db: getDb(), enqueue: enqueueDelivery }, idSchema.parse(id), user.id);
  } catch (error) {
    if (!(error instanceof WebhookError)) logger.error("webhook.ping_failed", { webhookId: id, ...errorSummary(error) });
    return failure(error);
  }
  revalidatePath(PATH);
  return { status: "success", message: "Test ping queued. Refresh to see the result in the delivery log." };
}

export async function redeliverAction(deliveryId: string): Promise<void> {
  const user = await requireUser();
  await redeliver({ db: getDb(), enqueue: enqueueDelivery }, user.id, idSchema.parse(deliveryId)).catch(failure);
  revalidatePath(PATH);
}
