import { and, arrayContains, eq, isNull } from "drizzle-orm";
import { routingForm, routingFormResponse, webhook } from "@/db/schema";
import { logger } from "@/lib/logger";
import { formSubmittedPayloadSchema } from "../payload";
import { queueDeliveries, type EmitDeps } from "./emit";

/**
 * FORM_SUBMITTED (API-001, RTE-005). A personal form notifies its owner's personal webhooks that
 * subscribe to the trigger and are not scoped to one event type; a team form notifies the team's
 * webhooks. Deliveries are keyed by the response id, so a retry never duplicates them.
 */
export async function emitFormSubmitted(deps: EmitDeps, responseId: string): Promise<number> {
  const [row] = await deps.db
    .select({ form: routingForm, response: routingFormResponse })
    .from(routingFormResponse)
    .innerJoin(routingForm, eq(routingForm.id, routingFormResponse.formId))
    .where(eq(routingFormResponse.id, responseId));
  if (!row) {
    logger.warn("webhook.emit_missing_response", { responseId });
    return 0;
  }
  const { form, response } = row;
  const scope = form.teamId ? eq(webhook.teamId, form.teamId) : and(eq(webhook.ownerUserId, form.ownerUserId), isNull(webhook.teamId), isNull(webhook.eventTypeId));
  const subscriptions = await deps.db
    .select({ id: webhook.id })
    .from(webhook)
    .where(and(eq(webhook.active, true), arrayContains(webhook.triggers, ["FORM_SUBMITTED"]), scope));
  if (subscriptions.length === 0) return 0;
  const payload = formSubmittedPayloadSchema.parse({
    form: { id: form.id, name: form.name },
    response: {
      id: response.id,
      answers: response.answers,
      matchedRuleId: response.matchedRuleId ?? null,
      action: response.action,
      submittedAt: response.createdAt.toISOString(),
    },
  });
  const rows = await queueDeliveries(deps, subscriptions, "FORM_SUBMITTED", payload, `form:${response.id}`);
  logger.info("webhook.emitted", { responseId, trigger: "FORM_SUBMITTED", count: rows.length });
  return rows.length;
}
