"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { TeamError } from "@/features/teams/server/access";
import { type ActionState, parsePayload } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { workflowFormSchema } from "../schemas";
import { createTeamWorkflow, deleteWorkflow, setWorkflowEnabled, updateWorkflow, WorkflowError, workflowScope } from "./service";

/** Team workflows (NTF-007): admins and owners of the team manage them. */

const path = (teamId: string) => `/teams/${teamId}`;

/** A workflow id from the form must belong to this team, not just be manageable by the caller. */
async function inTeam(teamId: string, workflowId: string): Promise<boolean> {
  return (await workflowScope(getDb(), workflowId))?.teamId === teamId;
}

export async function saveTeamWorkflowAction(teamId: string, workflowId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, workflowFormSchema);
  if (!parsed.ok) return parsed.state;
  try {
    if (workflowId) {
      if (!(await inTeam(teamId, workflowId))) throw new WorkflowError("NOT_FOUND");
      await updateWorkflow(getDb(), user.id, workflowId, parsed.data);
    } else await createTeamWorkflow(getDb(), user.id, teamId, parsed.data);
  } catch (error) {
    if (error instanceof WorkflowError || error instanceof TeamError) return { status: "error", message: "You can't change this workflow." };
    throw error;
  }
  revalidatePath(path(teamId));
  return { status: "success", message: "Workflow saved." };
}

export async function toggleTeamWorkflowAction(teamId: string, workflowId: string, enabled: boolean): Promise<void> {
  const user = await requireUser();
  if (!(await inTeam(teamId, workflowId))) return;
  await setWorkflowEnabled(getDb(), user.id, workflowId, enabled).catch((e) => {
    if (!(e instanceof WorkflowError)) throw e;
  });
  revalidatePath(path(teamId));
}

export async function deleteTeamWorkflowAction(teamId: string, workflowId: string): Promise<void> {
  const user = await requireUser();
  if (!(await inTeam(teamId, workflowId))) return;
  await deleteWorkflow(getDb(), user.id, workflowId).catch((e) => {
    if (!(e instanceof WorkflowError)) throw e;
  });
  revalidatePath(path(teamId));
}
