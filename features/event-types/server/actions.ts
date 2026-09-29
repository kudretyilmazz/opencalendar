"use server";

import { revalidatePath } from "next/cache";
import { invalidatePublicContext } from "@/features/bookings/server/public-context";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { type ActionState, parsePayload } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { z } from "zod";
import { ConnectionError, setEventTypeCalendars } from "@/features/calendars/server/connections";
import { eventTypeFormSchema } from "../schemas";
import {
  createEventType,
  deleteEventType,
  duplicateEventType,
  EventTypeError,
  moveEventType,
  setEventTypeEnabled,
  updateEventType,
} from "./service";

const MESSAGES: Record<EventTypeError["code"], ActionState> = {
  SLUG_TAKEN: { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { slug: "You already use this URL" } },
  SCHEDULE_NOT_FOUND: { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { scheduleId: "Schedule not found" } },
  NOT_FOUND: { status: "error", message: "This event type no longer exists." },
  HAS_UPCOMING_BOOKINGS: {
    status: "error",
    message: "This event type has upcoming bookings. Turn it off instead, or cancel those bookings first.",
  },
};

const calendarSettingsSchema = z
  .object({
    calendarSettings: z
      .object({ conflictCalendarIds: z.array(z.string().max(64)).max(50), destinationCalendarId: z.string().max(64).nullable() })
      .default({ conflictCalendarIds: [], destinationCalendarId: null }),
  })
  .transform((v) => v.calendarSettings);

async function saveCalendars(userId: string, eventTypeId: string, formData: FormData): Promise<ActionState | null> {
  const parsed = parsePayload(formData, calendarSettingsSchema);
  if (!parsed.ok) return parsed.state;
  try {
    await setEventTypeCalendars(getDb(), userId, eventTypeId, parsed.data);
    return null;
  } catch (error) {
    if (error instanceof ConnectionError) {
      return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { destinationCalendarId: "Pick a writable calendar you own" } };
    }
    throw error;
  }
}

async function run(fn: () => Promise<void>): Promise<ActionState | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    if (error instanceof EventTypeError) return MESSAGES[error.code];
    throw error;
  }
}

export async function createEventTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, eventTypeFormSchema);
  if (!parsed.ok) return parsed.state;
  let id = "";
  const failed = await run(async () => {
    id = await createEventType(getDb(), user.id, parsed.data, { defaultReminder: true });
  });
  if (failed) return failed;
  const calendarsFailed = await saveCalendars(user.id, id, formData);
  if (calendarsFailed) return calendarsFailed;
  invalidatePublicContext();
  revalidatePath("/event-types");
  redirect("/event-types");
}

export async function saveEventTypeAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parsePayload(formData, eventTypeFormSchema);
  if (!parsed.ok) return parsed.state;
  const failed = (await run(() => updateEventType(getDb(), user.id, id, parsed.data))) ?? (await saveCalendars(user.id, id, formData));
  if (failed) return failed;
  invalidatePublicContext();
  revalidatePath("/event-types");
  return { status: "success", message: "Event type saved." };
}

export async function toggleEventTypeAction(id: string, enabled: boolean): Promise<void> {
  const user = await requireUser();
  await run(() => setEventTypeEnabled(getDb(), user.id, id, enabled));
  invalidatePublicContext();
  revalidatePath("/event-types");
}

export async function duplicateEventTypeAction(id: string): Promise<void> {
  const user = await requireUser();
  await run(async () => {
    await duplicateEventType(getDb(), user.id, id);
  });
  invalidatePublicContext();
  revalidatePath("/event-types");
}

export async function deleteEventTypeAction(id: string): Promise<void> {
  const user = await requireUser();
  const failed = await run(() => deleteEventType(getDb(), user.id, id));
  invalidatePublicContext();
  revalidatePath("/event-types");
  redirect(failed?.message ? `/event-types?error=${encodeURIComponent(failed.message)}` : "/event-types");
}

export async function moveEventTypeAction(id: string, direction: "up" | "down"): Promise<void> {
  const user = await requireUser();
  await run(() => moveEventType(getDb(), user.id, id, direction));
  invalidatePublicContext();
  revalidatePath("/event-types");
}
