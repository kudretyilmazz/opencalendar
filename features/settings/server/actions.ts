"use server";

import { revalidatePath } from "next/cache";
import { invalidatePublicContext } from "@/features/bookings/server/public-context";
import { getDb } from "@/db/client";
import { isValidTimeZone } from "@/lib/availability/tz";
import { requireUser } from "@/lib/auth/session";
import { profileSettingsSchema } from "../schemas";
import { setTimeZone, updateProfile } from "./service";

export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
};

export async function saveProfileAction(_prev: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  // 1. authenticate  2. validate  3. act only on the session user's own row (never an id from input)
  const user = await requireUser();
  const parsed = profileSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }
  const result = await updateProfile(getDb(), user.id, parsed.data);
  if (!result.ok) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { username: "This username is already taken" } };
  }
  invalidatePublicContext(); // username / time zone feed the public booking context
  revalidatePath("/", "layout");
  return { status: "success", message: "Settings saved." };
}

/** Dashboard setup step: saves the time zone the browser reported. */
export async function setTimeZoneAction(timeZone: string): Promise<ProfileActionState> {
  const user = await requireUser();
  if (typeof timeZone !== "string" || timeZone === "UTC" || !isValidTimeZone(timeZone)) {
    return { status: "error", message: "We couldn't detect your time zone. Set it in Settings." };
  }
  await setTimeZone(getDb(), user.id, timeZone);
  invalidatePublicContext();
  revalidatePath("/", "layout");
  return { status: "success", message: "Time zone saved." };
}
