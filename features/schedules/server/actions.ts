"use server";

import { revalidatePath } from "next/cache";
import { invalidatePublicContext } from "@/features/bookings/server/public-context";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { type ActionState, parsePayload } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { DEFAULT_RULES, scheduleFormSchema } from "../schemas";
import { createSchedule, deleteSchedule, ScheduleError, setDefaultSchedule, updateSchedule } from "./service";

export async function createScheduleAction(): Promise<void> {
  const user = await requireUser();
  const id = await createSchedule(getDb(), user.id, {
    name: "New schedule",
    timeZone: user.timeZone ?? "UTC",
    rules: DEFAULT_RULES,
    overrides: [],
  });
  redirect(`/availability/${id}`);
}

export async function saveScheduleAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, scheduleFormSchema);
  if (!parsed.ok) return parsed.state;
  try {
    await updateSchedule(getDb(), user.id, id, parsed.data);
  } catch (error) {
    if (error instanceof ScheduleError) return { status: "error", message: "This schedule no longer exists." };
    throw error;
  }
  invalidatePublicContext();
  revalidatePath("/availability");
  return { status: "success", message: "Schedule saved." };
}

export async function setDefaultScheduleAction(id: string): Promise<void> {
  const user = await requireUser();
  await setDefaultSchedule(getDb(), user.id, id);
  invalidatePublicContext();
  revalidatePath("/availability");
}

export async function deleteScheduleAction(id: string): Promise<void> {
  const user = await requireUser();
  try {
    await deleteSchedule(getDb(), user.id, id);
  } catch (error) {
    if (!(error instanceof ScheduleError)) throw error;
  }
  invalidatePublicContext();
  revalidatePath("/availability");
  redirect("/availability");
}
