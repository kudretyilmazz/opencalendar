import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { profileSettings, user } from "@/db/schema";
import type { ProfileSettingsInput } from "../schemas";

export type Profile = {
  name: string;
  email: string;
  emailVerified: boolean;
  username: string | null;
  timeZone: string;
  locale: string;
  weekStart: number;
  timeFormat: number;
  theme: "system" | "light" | "dark";
  allowDynamicGroup: boolean;
};

export type UpdateProfileResult = { ok: true } | { ok: false; error: "USERNAME_TAKEN" };

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code === UNIQUE_VIOLATION;
}

export async function getProfile(db: Database, userId: string): Promise<Profile | null> {
  const [row] = await db
    .select({
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      username: user.username,
      timeZone: user.timeZone,
      locale: user.locale,
      weekStart: user.weekStart,
      timeFormat: user.timeFormat,
      theme: profileSettings.theme,
      allowDynamicGroup: profileSettings.allowDynamicGroup,
    })
    .from(user)
    .leftJoin(profileSettings, eq(profileSettings.userId, user.id))
    .where(eq(user.id, userId));
  if (!row) return null;
  return { ...row, theme: row.theme ?? "system", allowDynamicGroup: row.allowDynamicGroup ?? false };
}

/** Updates the caller's own profile. `userId` must come from the session, never from input. */
export async function updateProfile(
  db: Database,
  userId: string,
  input: ProfileSettingsInput,
): Promise<UpdateProfileResult> {
  const { theme, allowDynamicGroup, ...userFields } = input;
  try {
    await db.transaction(async (tx) => {
      await tx.update(user).set(userFields).where(eq(user.id, userId));
      await tx
        .insert(profileSettings)
        .values({ userId, theme, allowDynamicGroup })
        .onConflictDoUpdate({ target: profileSettings.userId, set: { theme, allowDynamicGroup } });
    });
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "USERNAME_TAKEN" };
    throw error;
  }
}

/** Sets only the time zone (the dashboard's one-click "use my time zone"); callers validate it. */
export async function setTimeZone(db: Database, userId: string, timeZone: string): Promise<void> {
  await db.update(user).set({ timeZone }).where(eq(user.id, userId));
}
