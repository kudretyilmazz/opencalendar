"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { workflowFormSchema } from "@/features/workflows/schemas";
import { createWorkflow, deleteWorkflow, setWorkflowEnabled, updateWorkflow, WorkflowError } from "@/features/workflows/server/service";
import { type ActionState, parsePayload } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { getEnv } from "@/lib/env";
import { invalidatePublicContext } from "@/features/bookings/server/public-context";
import { createPrivateLink, deletePrivateLink } from "./private-links";
import { EventTypeError } from "./service";

/** Event-type extras edited outside the main form: private links (EVT-015) and workflows (NTF-005). */

const path = (eventTypeId: string) => `/event-types/${eventTypeId}`;

const linkSchema = z.object({ expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")) });

export async function createPrivateLinkAction(eventTypeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = linkSchema.safeParse({ expiresAt: formData.get("expiresAt") ?? "" });
  if (!parsed.success) return { status: "error", message: "Pick a valid expiry date." };
  // Valid through the chosen day (UTC end of day; a few hours of slack around the host's zone is fine).
  const expiresAt = parsed.data.expiresAt ? new Date(`${parsed.data.expiresAt}T23:59:59Z`) : null;
  try {
    await createPrivateLink(getDb(), cipherFromEnv(getEnv()), user.id, eventTypeId, expiresAt);
  } catch (error) {
    if (error instanceof EventTypeError) return { status: "error", message: "Couldn't create the link." };
    throw error;
  }
  revalidatePath(path(eventTypeId));
  return { status: "success", message: "Link created." };
}

export async function deletePrivateLinkAction(eventTypeId: string, id: string): Promise<void> {
  const user = await requireUser();
  await deletePrivateLink(getDb(), user.id, eventTypeId, id).catch((e) => {
    if (!(e instanceof EventTypeError)) throw e;
  });
  invalidatePublicContext();
  revalidatePath(path(eventTypeId));
}

export async function saveWorkflowAction(eventTypeId: string, workflowId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, workflowFormSchema);
  if (!parsed.ok) return parsed.state;
  try {
    if (workflowId) await updateWorkflow(getDb(), user.id, workflowId, parsed.data);
    else await createWorkflow(getDb(), user.id, eventTypeId, parsed.data);
  } catch (error) {
    if (error instanceof WorkflowError) return { status: "error", message: "This workflow no longer exists." };
    throw error;
  }
  revalidatePath(path(eventTypeId));
  return { status: "success", message: "Workflow saved." };
}

export async function toggleWorkflowAction(eventTypeId: string, workflowId: string, enabled: boolean): Promise<void> {
  const user = await requireUser();
  await setWorkflowEnabled(getDb(), user.id, workflowId, enabled).catch((e) => {
    if (!(e instanceof WorkflowError)) throw e;
  });
  revalidatePath(path(eventTypeId));
}

export async function deleteWorkflowAction(eventTypeId: string, workflowId: string): Promise<void> {
  const user = await requireUser();
  await deleteWorkflow(getDb(), user.id, workflowId).catch((e) => {
    if (!(e instanceof WorkflowError)) throw e;
  });
  revalidatePath(path(eventTypeId));
}
