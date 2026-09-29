import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import { eventType, workflow } from "@/db/schema";
import { requireTeamRole, TeamError } from "@/features/teams/server/access";
import { newId } from "@/lib/ids";
import { DEFAULT_REMINDER, type WorkflowForm } from "../schemas";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type WorkflowRow = typeof workflow.$inferSelect;

export class WorkflowError extends Error {
  constructor(public readonly code: "NOT_FOUND") {
    super(code);
    this.name = "WorkflowError";
  }
}

/** NTF-006: every new event type starts with a 24-hour reminder to attendees. */
export async function createDefaultReminder(tx: Tx | Database, ownerUserId: string, eventTypeId: string): Promise<void> {
  await tx.insert(workflow).values({ id: newId(), ownerUserId, eventTypeId, ...DEFAULT_REMINDER, isDefault: true });
}

/**
 * Personal event types only: a team event type's `owner_user_id` is just its creator, whose role
 * may have changed since — team workflows (with a live role check) cover team event types.
 */
async function assertEventTypeOwned(db: Database, userId: string, eventTypeId: string) {
  const [row] = await db
    .select({ id: eventType.id })
    .from(eventType)
    .where(and(eq(eventType.id, eventTypeId), eq(eventType.ownerUserId, userId), isNull(eventType.teamId)));
  if (!row) throw new WorkflowError("NOT_FOUND");
}

export async function listWorkflows(db: Database, userId: string, eventTypeId: string): Promise<WorkflowRow[]> {
  return db
    .select()
    .from(workflow)
    .where(and(eq(workflow.ownerUserId, userId), eq(workflow.eventTypeId, eventTypeId)))
    .orderBy(asc(workflow.createdAt));
}

export async function createWorkflow(db: Database, userId: string, eventTypeId: string, input: WorkflowForm): Promise<string> {
  await assertEventTypeOwned(db, userId, eventTypeId);
  const id = newId();
  await db.insert(workflow).values({ id, ownerUserId: userId, eventTypeId, ...input });
  return id;
}

/**
 * The workflow, if `userId` may manage it: a personal one by its owner, a team one (NTF-007) by
 * any admin or owner of the team.
 */
async function manageable(db: Database, userId: string, id: string): Promise<WorkflowRow> {
  const [row] = await db.select().from(workflow).where(eq(workflow.id, id));
  if (!row) throw new WorkflowError("NOT_FOUND");
  if (row.teamId) {
    await requireTeamRole(db, userId, row.teamId, "admin").catch((error) => {
      throw error instanceof TeamError ? new WorkflowError("NOT_FOUND") : error;
    });
    return row;
  }
  if (row.ownerUserId !== userId || !row.eventTypeId) throw new WorkflowError("NOT_FOUND");
  await assertEventTypeOwned(db, userId, row.eventTypeId);
  return row;
}

export async function updateWorkflow(db: Database, userId: string, id: string, input: WorkflowForm): Promise<void> {
  await manageable(db, userId, id);
  await db.update(workflow).set(input).where(eq(workflow.id, id));
}

export async function setWorkflowEnabled(db: Database, userId: string, id: string, enabled: boolean): Promise<void> {
  await manageable(db, userId, id);
  await db.update(workflow).set({ enabled }).where(eq(workflow.id, id));
}

export async function deleteWorkflow(db: Database, userId: string, id: string): Promise<void> {
  await manageable(db, userId, id);
  await db.delete(workflow).where(eq(workflow.id, id));
}

/** NTF-007: team workflows apply to every event type of the team (and managed copies). */
export async function listTeamWorkflows(db: Database, userId: string, teamId: string): Promise<WorkflowRow[]> {
  await requireTeamRole(db, userId, teamId, "admin");
  return db.select().from(workflow).where(eq(workflow.teamId, teamId)).orderBy(asc(workflow.createdAt));
}

export async function createTeamWorkflow(db: Database, userId: string, teamId: string, input: WorkflowForm): Promise<string> {
  await requireTeamRole(db, userId, teamId, "admin");
  const id = newId();
  await db.insert(workflow).values({ id, ownerUserId: userId, teamId, ...input });
  return id;
}

/** Only this scope's workflows: guards update/delete against ids from another scope. */
export async function workflowScope(db: Database, id: string): Promise<{ eventTypeId: string | null; teamId: string | null } | null> {
  const [row] = await db.select({ eventTypeId: workflow.eventTypeId, teamId: workflow.teamId }).from(workflow).where(eq(workflow.id, id));
  return row ?? null;
}

/**
 * Enabled workflows for a booking of this event type: its own, plus its team's (NTF-007) — for a
 * managed copy, the template's team.
 */
export async function activeWorkflows(db: Database, eventTypeId: string): Promise<WorkflowRow[]> {
  const [et] = await db.select({ teamId: eventType.teamId, parentId: eventType.parentId }).from(eventType).where(eq(eventType.id, eventTypeId));
  const [parent] = et?.parentId ? await db.select({ teamId: eventType.teamId }).from(eventType).where(eq(eventType.id, et.parentId)) : [];
  const teams = [et?.teamId, parent?.teamId].filter((t): t is string => Boolean(t));
  return db
    .select()
    .from(workflow)
    .where(and(eq(workflow.enabled, true), or(eq(workflow.eventTypeId, eventTypeId), teams.length ? inArray(workflow.teamId, teams) : undefined)));
}
