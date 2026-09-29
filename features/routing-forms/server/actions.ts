"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type ActionState, parsePayload } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { clientIp, overLimit } from "@/lib/security/public-limits";
import { createRoutingFormSchema, routingFormSchema } from "../schemas";
import { createForm, deleteForm, RoutingError, submitResponse, type RoutingTarget, updateForm } from "./service";

const FIX: ActionState = { status: "error", message: "Please fix the highlighted fields." };

function stateFor(error: RoutingError): ActionState {
  switch (error.code) {
    case "NOT_FOUND":
      return { status: "error", message: "This routing form no longer exists." };
    case "INVALID_TARGET":
    case "INVALID_ANSWERS":
      return { ...FIX, fieldErrors: error.fieldErrors };
  }
}

export async function createRoutingFormAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, createRoutingFormSchema);
  if (!parsed.ok) return parsed.state;
  let id: string;
  try {
    id = await createForm(getDb(), user.id, parsed.data.teamId, parsed.data.form);
  } catch (error) {
    if (error instanceof RoutingError) return stateFor(error);
    throw error;
  }
  revalidatePath("/routing-forms");
  redirect(`/routing-forms/${id}`);
}

export async function saveRoutingFormAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, routingFormSchema);
  if (!parsed.ok) return parsed.state;
  try {
    await updateForm(getDb(), user.id, id, parsed.data);
  } catch (error) {
    if (error instanceof RoutingError) return stateFor(error);
    throw error;
  }
  revalidatePath("/routing-forms");
  revalidatePath(`/routing-forms/${id}`);
  return { status: "success", message: "Saved." };
}

export async function deleteRoutingFormAction(id: string): Promise<void> {
  const user = await requireUser();
  try {
    await deleteForm(getDb(), user.id, id);
  } catch (error) {
    if (!(error instanceof RoutingError)) throw error;
  }
  revalidatePath("/routing-forms");
  redirect("/routing-forms");
}

export type SubmitState = ActionState & { target?: RoutingTarget };

const submitSchema = z.object({ answers: z.record(z.string().max(40), z.unknown()) });

/** Public submit (RTE-002…005): no session, rate limited per client IP and per form. */
export async function submitRoutingFormAction(formId: string, _prev: SubmitState, formData: FormData): Promise<SubmitState> {
  if ((await overLimit("routing", clientIp(await headers()))) || (await overLimit("routingForm", formId.slice(0, 64)))) {
    return { status: "error", message: "Too many requests. Please wait a moment and try again." };
  }
  const parsed = parsePayload(formData, submitSchema);
  if (!parsed.ok) return parsed.state;
  try {
    const { target } = await submitResponse(getDb(), formId, parsed.data.answers);
    return { status: "success", target };
  } catch (error) {
    if (error instanceof RoutingError) return stateFor(error);
    throw error;
  }
}
