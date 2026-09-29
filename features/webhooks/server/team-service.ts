import { z } from "zod";
import type { Database } from "@/db/client";
import { webhook } from "@/db/schema";
import { requireTeamRole } from "@/features/teams/server/access";
import type { Cipher } from "@/lib/crypto/encryption";
import { newId } from "@/lib/ids";
import { WebhookError } from "./errors";
import {
  countIn,
  deleteIn,
  generateWebhookSecret,
  listDeliveriesIn,
  listIn,
  resetDeliveryIn,
  rollSecretIn,
  sealSecret,
  triggersSchema,
  updateIn,
  type WebhookPatch,
  type WebhookScope,
} from "./scoped";

/**
 * Team-scoped webhooks (API-001). Every function re-checks the caller's live team role (admin or
 * owner) instead of trusting who created the subscription: a demoted or removed creator loses
 * access at once. Non-members get TeamError NOT_FOUND, plain members FORBIDDEN; a webhook id from
 * another team or from a personal scope is WebhookError NOT_FOUND.
 */

export const MAX_WEBHOOKS_PER_TEAM = 25;

export const teamWebhookInputSchema = z.object({
  url: z.string().trim().url("Enter a valid URL").max(2048),
  triggers: triggersSchema,
});

export type TeamWebhookInput = z.infer<typeof teamWebhookInputSchema>;

const scopeOf = (teamId: string): WebhookScope => ({ kind: "team", teamId });

async function admin(db: Database, userId: string, teamId: string): Promise<WebhookScope> {
  await requireTeamRole(db, userId, teamId, "admin");
  return scopeOf(teamId);
}

export async function listTeamWebhooks(db: Database, userId: string, teamId: string) {
  return listIn(db, await admin(db, userId, teamId));
}

export async function createTeamWebhook(
  db: Database,
  cipher: Cipher,
  userId: string,
  teamId: string,
  input: TeamWebhookInput,
): Promise<{ id: string; secret: string }> {
  const scope = await admin(db, userId, teamId);
  const data = teamWebhookInputSchema.parse(input);
  if ((await countIn(db, scope)) >= MAX_WEBHOOKS_PER_TEAM) throw new WebhookError("LIMIT_REACHED");
  const id = newId();
  const secret = generateWebhookSecret();
  await db.insert(webhook).values({
    id,
    ownerUserId: userId,
    teamId,
    eventTypeId: null,
    url: data.url,
    encryptedSecret: sealSecret(cipher, id, secret),
    triggers: [...data.triggers],
  });
  return { id, secret };
}

export async function updateTeamWebhook(db: Database, userId: string, teamId: string, id: string, patch: WebhookPatch): Promise<void> {
  await updateIn(db, await admin(db, userId, teamId), id, patch);
}

/** Pause or resume. */
export const toggleTeamWebhook = (db: Database, userId: string, teamId: string, id: string, active: boolean): Promise<void> =>
  updateTeamWebhook(db, userId, teamId, id, { active });

export async function deleteTeamWebhook(db: Database, userId: string, teamId: string, id: string): Promise<void> {
  await deleteIn(db, await admin(db, userId, teamId), id);
}

export async function rollTeamWebhookSecret(db: Database, cipher: Cipher, userId: string, teamId: string, id: string): Promise<string> {
  return rollSecretIn(db, cipher, await admin(db, userId, teamId), id);
}

export async function listTeamDeliveries(db: Database, userId: string, teamId: string, webhookId: string, limit?: number) {
  return listDeliveriesIn(db, await admin(db, userId, teamId), webhookId, limit);
}

export async function redeliverTeam(
  deps: { db: Database; enqueue(deliveryId: string): Promise<void> },
  userId: string,
  teamId: string,
  deliveryId: string,
): Promise<void> {
  await resetDeliveryIn(deps.db, await admin(deps.db, userId, teamId), deliveryId);
  await deps.enqueue(deliveryId);
}
