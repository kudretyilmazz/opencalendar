"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { TeamError } from "@/features/teams/server/access";
import { fieldErrors } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { getEnv } from "@/lib/env";
import { enqueue } from "@/lib/jobs/enqueue";
import { errorSummary, logger } from "@/lib/logger";
import { triggersSchema } from "./scoped";
import { emitTeamPing } from "./emit";
import { WebhookError } from "./errors";
import {
  createTeamWebhook,
  deleteTeamWebhook,
  redeliverTeam,
  rollTeamWebhookSecret,
  teamWebhookInputSchema,
  toggleTeamWebhook,
  updateTeamWebhook,
} from "./team-service";
import { checkWebhookUrl } from "./url";
import type { WebhookActionState } from "./actions";

/** Team-scope server actions (API-001). Authorization is the service's live admin check. */

const idSchema = z.string().min(1).max(64);
const pathOf = (teamId: string): string => `/teams/${teamId}`;

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "That webhook no longer exists.",
  LIMIT_REACHED: "This team has reached the maximum number of webhooks.",
  NOT_RETRYABLE: "Only failed deliveries can be retried.",
};

function failure(error: unknown): WebhookActionState {
  if (error instanceof TeamError) return { status: "error", message: "Only team admins can manage webhooks." };
  if (error instanceof WebhookError) return { status: "error", message: MESSAGES[error.code] ?? "That didn't work." };
  throw error;
}

const enqueueDelivery = async (deliveryId: string): Promise<void> => {
  await enqueue("webhookDeliver", { deliveryId });
};

export async function createTeamWebhookAction(teamId: string, _prev: WebhookActionState, formData: FormData): Promise<WebhookActionState> {
  const user = await requireUser();
  const parsed = teamWebhookInputSchema.safeParse({ url: String(formData.get("url") ?? ""), triggers: formData.getAll("triggers").map(String) });
  if (!parsed.success) return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const env = getEnv();
  const checked = await checkWebhookUrl(parsed.data.url, { allowPrivate: env.WEBHOOK_ALLOW_PRIVATE });
  if (!checked.ok) return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { url: checked.message } };
  try {
    const { secret } = await createTeamWebhook(getDb(), cipherFromEnv(env), user.id, idSchema.parse(teamId), { ...parsed.data, url: checked.url });
    revalidatePath(pathOf(teamId));
    return { status: "success", message: "Webhook created. Copy the signing secret now; it won't be shown again.", secret };
  } catch (error) {
    return failure(error);
  }
}

export async function setTeamWebhookActiveAction(teamId: string, id: string, active: boolean): Promise<void> {
  const user = await requireUser();
  await toggleTeamWebhook(getDb(), user.id, idSchema.parse(teamId), idSchema.parse(id), Boolean(active)).catch(failure);
  revalidatePath(pathOf(teamId));
}

export async function updateTeamTriggersAction(teamId: string, id: string, _prev: WebhookActionState, formData: FormData): Promise<WebhookActionState> {
  const user = await requireUser();
  const parsed = triggersSchema.safeParse(formData.getAll("triggers").map(String));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Choose at least one trigger" };
  try {
    await updateTeamWebhook(getDb(), user.id, idSchema.parse(teamId), idSchema.parse(id), { triggers: parsed.data });
  } catch (error) {
    return failure(error);
  }
  revalidatePath(pathOf(teamId));
  return { status: "success", message: "Triggers saved." };
}

export async function deleteTeamWebhookAction(teamId: string, id: string): Promise<void> {
  const user = await requireUser();
  await deleteTeamWebhook(getDb(), user.id, idSchema.parse(teamId), idSchema.parse(id)).catch(failure);
  revalidatePath(pathOf(teamId));
}

export async function rollTeamSecretAction(teamId: string, id: string, _prev: WebhookActionState): Promise<WebhookActionState> {
  const user = await requireUser();
  try {
    const secret = await rollTeamWebhookSecret(getDb(), cipherFromEnv(getEnv()), user.id, idSchema.parse(teamId), idSchema.parse(id));
    return { status: "success", message: "New secret created. Update your receiver; the old secret no longer works.", secret };
  } catch (error) {
    return failure(error);
  }
}

export async function pingTeamWebhookAction(teamId: string, id: string, _prev: WebhookActionState): Promise<WebhookActionState> {
  const user = await requireUser();
  try {
    await emitTeamPing({ db: getDb(), enqueue: enqueueDelivery }, user.id, idSchema.parse(teamId), idSchema.parse(id));
  } catch (error) {
    if (!(error instanceof WebhookError) && !(error instanceof TeamError)) logger.error("webhook.ping_failed", { webhookId: id, ...errorSummary(error) });
    return failure(error);
  }
  revalidatePath(pathOf(teamId));
  return { status: "success", message: "Test ping queued. Refresh to see the result in the delivery log." };
}

export async function redeliverTeamAction(teamId: string, deliveryId: string): Promise<void> {
  const user = await requireUser();
  await redeliverTeam({ db: getDb(), enqueue: enqueueDelivery }, user.id, idSchema.parse(teamId), idSchema.parse(deliveryId)).catch(failure);
  revalidatePath(pathOf(teamId));
}
