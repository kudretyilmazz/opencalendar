import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db/client";
import { eventType, eventTypeQuestion, membership, routingForm, routingFormResponse, team, user } from "@/db/schema";
import type { RoutingAction, RoutingAnswers, RoutingField } from "@/db/schema/routing";
import { requireTeamRole, TeamError } from "@/features/teams/server/access";
import { emitFormSubmitted } from "@/features/webhooks/server/emit-form";
import { newId } from "@/lib/ids";
import { enqueue } from "@/lib/jobs/enqueue";
import { errorSummary, logger } from "@/lib/logger";
import { evaluateRouting } from "../evaluate";
import { answersSchema, type RoutingFormInput } from "../schemas";
import { bookingUrlWithPrefill } from "../target";
import { type CsvResponse, responsesCsv } from "./csv";

/**
 * Routing forms service (RTE-001…006). Authorization lives here, not in the UI: a personal form
 * is managed by its owner, a team form by team admins and owners. Everyone else gets NOT_FOUND so
 * the existence of a form is never revealed (ADR-0004).
 */

export { responsesCsv };

export type RoutingFormRow = typeof routingForm.$inferSelect;
export type RoutingErrorCode = "NOT_FOUND" | "INVALID_TARGET" | "INVALID_ANSWERS";

export class RoutingError extends Error {
  constructor(
    public readonly code: RoutingErrorCode,
    public readonly fieldErrors: Readonly<Record<string, string>> = {},
  ) {
    super(code);
    this.name = "RoutingError";
  }
}

export type RoutingTarget = { kind: "redirect"; url: string } | { kind: "message"; message: string };
export type Owner = { userId: string; teamId: string | null };

// --- authorization --------------------------------------------------------------------------

async function assertCanManage(db: DbOrTx, userId: string, form: Pick<RoutingFormRow, "ownerUserId" | "teamId">): Promise<void> {
  if (form.teamId === null) {
    if (form.ownerUserId !== userId) throw new RoutingError("NOT_FOUND");
    return;
  }
  try {
    await requireTeamRole(db, userId, form.teamId, "admin");
  } catch (error) {
    if (error instanceof TeamError) throw new RoutingError("NOT_FOUND");
    throw error;
  }
}

/** The form if the user may manage it, otherwise throws NOT_FOUND. */
export async function getManagedForm(db: DbOrTx, userId: string, formId: string): Promise<RoutingFormRow> {
  const [form] = await db.select().from(routingForm).where(eq(routingForm.id, formId));
  if (!form) throw new RoutingError("NOT_FOUND");
  await assertCanManage(db, userId, form);
  return form;
}

/** Teams in which the user may own routing forms (admin or owner). */
export async function listManageableTeams(db: DbOrTx, userId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: team.id, name: team.name })
    .from(membership)
    .innerJoin(team, eq(team.id, membership.teamId))
    .where(and(eq(membership.userId, userId), inArray(membership.role, ["owner", "admin"])))
    .orderBy(asc(team.name));
}

export type FormListItem = RoutingFormRow & { teamName: string | null };

export async function listForms(db: DbOrTx, userId: string): Promise<FormListItem[]> {
  const personal = await db
    .select()
    .from(routingForm)
    .where(and(eq(routingForm.ownerUserId, userId), isNull(routingForm.teamId)));
  const shared = await db
    .select({ form: routingForm, teamName: team.name })
    .from(routingForm)
    .innerJoin(membership, and(eq(membership.teamId, routingForm.teamId), eq(membership.userId, userId)))
    .innerJoin(team, eq(team.id, routingForm.teamId))
    .where(inArray(membership.role, ["owner", "admin"]));
  return [...personal.map((form) => ({ ...form, teamName: null })), ...shared.map((r) => ({ ...r.form, teamName: r.teamName }))].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

// --- event type targets ---------------------------------------------------------------------

export type EventTypeOption = { id: string; title: string; slug: string };

const allowedEventTypes = (owner: Owner) =>
  owner.teamId === null
    ? and(eq(eventType.ownerUserId, owner.userId), isNull(eventType.teamId))
    : and(eq(eventType.teamId, owner.teamId), ne(eventType.schedulingType, "managed"));

/** Event types a form of this owner may route to. */
export async function listEventTypeOptions(db: DbOrTx, owner: Owner): Promise<EventTypeOption[]> {
  return db
    .select({ id: eventType.id, title: eventType.title, slug: eventType.slug })
    .from(eventType)
    .where(allowedEventTypes(owner))
    .orderBy(asc(eventType.title));
}

/** RTE-002: every event_type action must point at an event type the owner may route to. */
async function assertTargetsAllowed(db: DbOrTx, owner: Owner, input: Pick<RoutingFormInput, "rules" | "fallback">): Promise<void> {
  const refs: { path: string; action: RoutingAction }[] = [
    { path: "fallback", action: input.fallback },
    ...input.rules.map((r, i) => ({ path: `rules.${i}.action`, action: r.action })),
  ];
  const ids = refs.flatMap((r) => (r.action.kind === "event_type" ? [r.action.eventTypeId] : []));
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: eventType.id })
    .from(eventType)
    .where(and(inArray(eventType.id, [...new Set(ids)]), allowedEventTypes(owner)));
  const allowed = new Set(rows.map((r) => r.id));
  const errors = Object.fromEntries(
    refs.flatMap((r) => (r.action.kind === "event_type" && !allowed.has(r.action.eventTypeId) ? [[`${r.path}.eventTypeId`, "Pick one of your event types"]] : [])),
  );
  if (Object.keys(errors).length > 0) throw new RoutingError("INVALID_TARGET", errors);
}

// --- CRUD -----------------------------------------------------------------------------------

export async function createForm(db: Database, userId: string, teamId: string | null, input: RoutingFormInput): Promise<string> {
  if (teamId !== null) await assertCanManage(db, userId, { ownerUserId: userId, teamId });
  await assertTargetsAllowed(db, { userId, teamId }, input);
  const id = newId();
  await db.insert(routingForm).values({ id, ownerUserId: userId, teamId, ...input });
  return id;
}

export async function updateForm(db: Database, userId: string, formId: string, input: RoutingFormInput): Promise<void> {
  const form = await getManagedForm(db, userId, formId);
  await assertTargetsAllowed(db, { userId: form.ownerUserId, teamId: form.teamId }, input);
  await db.update(routingForm).set(input).where(eq(routingForm.id, formId));
}

/** Opens or closes a form for new responses (the builder's "Accepting responses" switch). */
export async function setFormDisabled(db: Database, userId: string, formId: string, disabled: boolean): Promise<void> {
  await getManagedForm(db, userId, formId);
  await db.update(routingForm).set({ disabled }).where(eq(routingForm.id, formId));
}

export async function deleteForm(db: Database, userId: string, formId: string): Promise<void> {
  await getManagedForm(db, userId, formId);
  await db.delete(routingForm).where(eq(routingForm.id, formId));
}

// --- responses (admin) ----------------------------------------------------------------------

export async function listResponses(
  db: DbOrTx,
  userId: string,
  formId: string,
  limit = 200,
): Promise<{ form: RoutingFormRow; rows: CsvResponse[] }> {
  const form = await getManagedForm(db, userId, formId);
  const rows = await db
    .select()
    .from(routingFormResponse)
    .where(eq(routingFormResponse.formId, formId))
    .orderBy(desc(routingFormResponse.createdAt), desc(routingFormResponse.id))
    .limit(limit);
  return { form, rows };
}

/** RTE-005: CSV of all responses (capped) for a form the user manages. */
export async function exportResponsesCsv(db: DbOrTx, userId: string, formId: string): Promise<{ filename: string; csv: string }> {
  const { form, rows } = await listResponses(db, userId, formId, 10_000);
  return { filename: `routing-responses-${form.id}.csv`, csv: responsesCsv(form.fields, rows) };
}

// --- public side ----------------------------------------------------------------------------

export type PublicForm = { id: string; name: string; description: string | null; fields: RoutingField[] };

/** null for unknown and disabled forms alike. */
export async function getPublicForm(db: DbOrTx, formId: string): Promise<PublicForm | null> {
  const [form] = await db.select().from(routingForm).where(and(eq(routingForm.id, formId), eq(routingForm.disabled, false)));
  return form ? { id: form.id, name: form.name, description: form.description, fields: form.fields } : null;
}

/** The message a submission resolved to, for the headless flow's `?message=<responseId>`. */
export async function getResponseMessage(db: DbOrTx, formId: string, responseId: string): Promise<string | null> {
  const [row] = await db
    .select({ action: routingFormResponse.action })
    .from(routingFormResponse)
    .innerJoin(routingForm, and(eq(routingForm.id, routingFormResponse.formId), eq(routingForm.disabled, false)))
    .where(and(eq(routingFormResponse.id, responseId), eq(routingFormResponse.formId, formId)));
  return row?.action.kind === "message" ? row.action.message : null;
}

const UNAVAILABLE: RoutingTarget = { kind: "message", message: "This booking page is not available right now. Please contact the organizer." };

async function resolveTarget(
  db: DbOrTx,
  form: RoutingFormRow,
  action: RoutingAction,
  answers: RoutingAnswers,
  responseId: string,
): Promise<RoutingTarget> {
  if (action.kind === "message") return { kind: "message", message: action.message };
  if (action.kind === "external_url") return { kind: "redirect", url: action.url };

  // Re-checked at submit time: the event type may have been deleted or moved since the form was saved.
  const [target] = await db
    .select({ slug: eventType.slug, username: user.username, teamSlug: team.slug })
    .from(eventType)
    .innerJoin(user, eq(user.id, eventType.ownerUserId))
    .leftJoin(team, eq(team.id, eventType.teamId))
    .where(and(eq(eventType.id, action.eventTypeId), allowedEventTypes({ userId: form.ownerUserId, teamId: form.teamId })));
  const path = target && (form.teamId ? target.teamSlug && `/team/${target.teamSlug}/${target.slug}` : target.username && `/${target.username}/${target.slug}`);
  if (!target || !path) return UNAVAILABLE;

  const questions = await db.select({ key: eventTypeQuestion.key }).from(eventTypeQuestion).where(eq(eventTypeQuestion.eventTypeId, action.eventTypeId));
  return { kind: "redirect", url: bookingUrlWithPrefill(path, { questionKeys: questions.map((q) => q.key), fields: form.fields, answers, responseId }) };
}

export type SubmitDeps = { enqueueDelivery?: (deliveryId: string) => Promise<void> };

const enqueueDelivery = async (deliveryId: string): Promise<void> => {
  await enqueue("webhookDeliver", { deliveryId });
};

/**
 * RTE-002…005: validate, route, store the response with its trace and return where to send the
 * visitor. Unknown or disabled forms are NOT_FOUND; bad answers throw INVALID_ANSWERS with
 * per-field messages.
 */
export async function submitResponse(
  db: Database,
  formId: string,
  rawAnswers: unknown,
  deps: SubmitDeps = {},
): Promise<{ responseId: string; target: RoutingTarget }> {
  const [form] = await db.select().from(routingForm).where(eq(routingForm.id, formId));
  if (!form || form.disabled) throw new RoutingError("NOT_FOUND");

  const parsed = answersSchema(form.fields).safeParse(rawAnswers);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
    throw new RoutingError("INVALID_ANSWERS", errors);
  }
  const answers = parsed.data;
  const outcome = evaluateRouting(form, answers);
  const responseId = newId();
  const target = await resolveTarget(db, form, outcome.action, answers, responseId);
  await db.insert(routingFormResponse).values({
    id: responseId,
    formId,
    answers,
    trace: outcome.trace,
    matchedRuleId: outcome.matchedRuleId,
    action: outcome.action,
  });
  // API-001: FORM_SUBMITTED webhooks. A failing subscriber setup must never fail the visitor's routing.
  await emitFormSubmitted({ db, enqueue: deps.enqueueDelivery ?? enqueueDelivery }, responseId).catch((error) =>
    logger.error("webhook.form_submitted_failed", { responseId, ...errorSummary(error) }),
  );
  return { responseId, target };
}
