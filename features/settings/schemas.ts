import { z } from "zod";

// Route segments and words a username must never shadow (public pages live at /{username}).
const RESERVED_USERNAMES = new Set([
  "admin", "api", "app", "auth", "booking", "dashboard", "embed", "forgot-password", "help",
  "login", "logout", "reset-password", "settings", "signup", "team", "teams", "check-email", "_next",
  "forms", "routing-forms", "event-types", "availability", "bookings", "about",
]);

const SUPPORTED_TIME_ZONES = new Set([...Intl.supportedValuesOf("timeZone"), "UTC"]);

export const LOCALES = ["en", "tr"] as const;
export const WEEK_STARTS = [0, 1, 6] as const; // Sunday, Monday, Saturday
export const TIME_FORMATS = [12, 24] as const;
export const THEMES = ["system", "light", "dark"] as const;

const oneOf = <T extends number>(values: readonly T[]) =>
  z.coerce.number().refine((n): n is T => values.includes(n as T), { message: "Unsupported value" });

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/, "3–32 characters: letters, numbers and inner hyphens")
  .refine((u) => !RESERVED_USERNAMES.has(u), "This username is reserved");

export const profileSettingsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  username: usernameSchema,
  timeZone: z.string().refine((tz) => SUPPORTED_TIME_ZONES.has(tz), "Unknown time zone"),
  locale: z.enum(LOCALES),
  weekStart: oneOf(WEEK_STARTS),
  timeFormat: oneOf(TIME_FORMATS),
  theme: z.enum(THEMES),
  /** Checkbox: "on" when ticked, absent otherwise (TEAM-009 opt-in). */
  allowDynamicGroup: z
    .union([z.literal("on"), z.boolean()])
    .optional()
    .transform((v) => v === "on" || v === true),
});

export type ProfileSettingsInput = z.infer<typeof profileSettingsSchema>;

export function listTimeZones(): string[] {
  return [...SUPPORTED_TIME_ZONES].toSorted();
}
