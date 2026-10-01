import { z } from "zod";
import { slugSchema } from "@/features/event-types/schemas";
import { TEAM_ROLES } from "./roles";

/** Team forms (TEAM-001…003, TEAM-005…008). Shared by server actions and client editors. */

export const teamFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  slug: slugSchema,
  logoUrl: z
    .string()
    .trim()
    .max(2000)
    .regex(/^https:\/\/\S+$/i, "Enter an https:// address")
    .nullable()
    .or(z.literal("").transform(() => null))
    .default(null),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Use a hex color like #2563eb")
    .nullable()
    .or(z.literal("").transform(() => null))
    .default(null),
});
export type TeamForm = z.infer<typeof teamFormSchema>;

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  role: z.enum(TEAM_ROLES),
});

export const roleChangeSchema = z.object({ userId: z.string().min(1).max(64), role: z.enum(TEAM_ROLES) });

/** TEAM-002: what happens to the member's future team bookings when they are removed. */
export const removeMemberSchema = z.object({
  userId: z.string().min(1).max(64),
  futureBookings: z.enum(["reassign", "cancel"]),
});

export const hostSchema = z.object({
  userId: z.string().min(1).max(64),
  isFixed: z.boolean(),
  weight: z.number().int().min(1).max(1000),
  priority: z.number().int().min(0).max(4),
});
export type HostForm = z.infer<typeof hostSchema>;

export const hostsSchema = z
  .object({
    hosts: z.array(hostSchema).max(50),
    roundRobinWindowDays: z.number().int().min(1).max(365).default(30),
    /** Every member is a host, including people who join later; `hosts` then only carries settings. */
    assignAll: z.boolean().default(false),
  })
  .refine((v) => new Set(v.hosts.map((h) => h.userId)).size === v.hosts.length, { message: "Each member can only be added once", path: ["hosts"] });

export const SCHEDULING_TYPES = ["collective", "round_robin", "managed"] as const;
export type SchedulingType = (typeof SCHEDULING_TYPES)[number];
export const SCHEDULING_LABELS: Record<SchedulingType, string> = {
  collective: "Collective — everyone attends",
  round_robin: "Round robin — one host per booking",
  managed: "Managed — a copy for each assigned member",
};

/**
 * TEAM-008: fields an admin can lock on a managed template. Each group names the form keys it
 * covers; the slug is always locked (members share the template's URL).
 */
export const LOCKABLE_FIELDS = {
  title: ["title", "description", "eventNameTemplate"],
  durations: ["durationMinutes", "extraDurations", "slotIntervalMinutes"],
  locations: ["locations"],
  questions: ["questions"],
  timing: ["bufferBeforeMinutes", "bufferAfterMinutes", "minNoticeMinutes", "horizonType", "horizonDays", "rangeStart", "rangeEnd"],
  limits: ["bookingLimits", "durationLimits", "maxGuests"],
  confirmation: ["requiresConfirmation", "confirmationThresholdMinutes"],
  policies: ["disableCancelling", "disableRescheduling", "cancelCutoffMinutes", "lockTimeZone", "redirectUrl", "redirectForwardParams"],
} as const;
export type LockableField = keyof typeof LOCKABLE_FIELDS;
export const LOCKABLE_LABELS: Record<LockableField, string> = {
  title: "Title, description and event name",
  durations: "Durations",
  locations: "Locations",
  questions: "Booking questions",
  timing: "Buffers, notice and booking window",
  limits: "Limits and guests",
  confirmation: "Requires confirmation",
  policies: "Cancellation and redirect policies",
};

export const managedSchema = z.object({
  lockedFields: z.array(z.enum(Object.keys(LOCKABLE_FIELDS) as [LockableField, ...LockableField[]])).max(20).transform((v) => [...new Set(v)]),
  assignees: z.array(z.string().min(1).max(64)).max(200).transform((v) => [...new Set(v)]),
});
