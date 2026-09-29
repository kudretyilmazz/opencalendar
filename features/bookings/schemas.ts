import { z } from "zod";
import { isValidTimeZone } from "@/lib/availability/tz";

const DAY = 86_400_000;

/**
 * Which booking page: `username` (personal, or "a+b" for a dynamic group, TEAM-009) or `team`
 * (a team event type, TEAM-001). Resolved by `resolveBookingTarget`.
 */
export const eventRefSchema = z.object({
  username: z.string().max(200).default(""),
  team: z.string().max(64).optional(),
  slug: z.string().min(1).max(64),
});

export const rescheduleRefSchema = z.object({ uid: z.string().min(1).max(64), token: z.string().min(1).max(128) });

export const slotsQuerySchema = eventRefSchema
  .extend({
    duration: z.coerce.number().int().positive(),
    start: z.coerce.number().int(),
    end: z.coerce.number().int(),
    reschedule: z.string().max(64).optional(),
    token: z.string().max(128).optional(),
    hold: z.string().max(128).optional(),
    /** Single-use link token, for link-only event types (EVT-015). */
    link: z.string().max(128).optional(),
  })
  .refine((q) => q.end > q.start && q.end - q.start <= 45 * DAY, { message: "Window must be at most 45 days" });

export const holdSchema = eventRefSchema.extend({
  start: z.number().int(),
  duration: z.number().int().positive(),
  holdToken: z.string().min(16).max(128),
  link: z.string().max(128).optional(),
});

export const bookerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  timeZone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  // Invalid tags would make Intl throw later (emails); canonicalize or fall back to "en".
  locale: z
    .string()
    .max(35)
    .default("en")
    .transform((tag) => {
      try {
        return Intl.getCanonicalLocales(tag)[0] ?? "en";
      } catch {
        return "en";
      }
    }),
});

export const createBookingSchema = eventRefSchema.extend({
  start: z.number().int(),
  duration: z.number().int().positive(),
  booker: bookerSchema,
  guests: z.array(z.string().trim().toLowerCase().email("Enter valid guest emails")).max(10).default([]),
  notes: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().uuid(),
  holdToken: z.string().max(128).optional(),
  reschedule: rescheduleRefSchema.optional(),
  locationIndex: z.number().int().min(0).max(10).optional(),
  /** E.164, required when the host calls the invitee (INT-011). */
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s()-]/g, ""))
    .pipe(z.string().regex(/^\+[1-9]\d{6,14}$/, "Enter your number in international format, e.g. +1 415 555 0100"))
    .optional(),
  /** Answers by question key; validated against the event type's questions (EVT-009). */
  responses: z.record(z.string().max(40), z.unknown()).default({}),
  utm: z
    .record(z.string().regex(/^utm_[a-z_]{1,30}$/), z.string().max(200))
    .refine((v) => Object.keys(v).length <= 10, "Too many utm parameters")
    .nullable()
    .optional(),
  embed: z.boolean().optional(),
  link: z.string().max(128).optional(),
  recurringCount: z.number().int().min(2).max(52).optional(),
  /** ALTCHA solution when the instance enables it (ADM-007). */
  captcha: z.string().max(2000).optional(),
  /** The routing-form response that led here (RTE-004). */
  routing: z.string().max(64).optional(),
});

export type CreateBookingPayload = z.input<typeof createBookingSchema>;

export const cancelBookingSchema = rescheduleRefSchema.extend({
  reason: z.string().trim().max(500).optional(),
  /** Recurring series: cancel this occurrence or every remaining one (EVT-013). */
  scope: z.enum(["booking", "series"]).default("booking"),
});
