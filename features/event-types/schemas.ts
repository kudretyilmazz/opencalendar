import { z } from "zod";
import { isValidTimeZone } from "@/lib/availability/tz";

export const HORIZON_TYPES = ["rolling_days", "rolling_business_days", "date_range", "unlimited"] as const;
export const LOCATION_KINDS = ["in_person", "phone_host", "phone_attendee", "link", "jitsi", "google_meet", "ms_teams", "zoom"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

/** Kinds whose value the host enters; the rest need no value (links are generated per booking). */
export const LOCATION_NEEDS_VALUE: Record<LocationKind, "address" | "phone" | "url" | null> = {
  in_person: "address",
  phone_host: "phone",
  phone_attendee: null,
  link: "url",
  jitsi: null,
  google_meet: null,
  ms_teams: null,
  zoom: null,
};

export const LOCATION_LABELS: Record<LocationKind, string> = {
  in_person: "In person",
  phone_host: "Phone call (invitee calls you)",
  phone_attendee: "Phone call (you call the invitee)",
  link: "Custom meeting link",
  jitsi: "Jitsi Meet",
  google_meet: "Google Meet",
  ms_teams: "Microsoft Teams",
  zoom: "Zoom",
};

export const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/; // E.164

export const locationSchema = z
  .object({ kind: z.enum(LOCATION_KINDS), value: z.string().trim().max(500).nullable() })
  .superRefine((loc, ctx) => {
    const needs = LOCATION_NEEDS_VALUE[loc.kind];
    if (needs && !loc.value) ctx.addIssue({ code: "custom", path: ["value"], message: "Enter the location details" });
    if (needs === "url" && loc.value && !/^https?:\/\/\S+$/i.test(loc.value)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a valid http(s) link" });
    }
    if (needs === "phone" && loc.value && !PHONE_PATTERN.test(loc.value.replace(/[\s()-]/g, ""))) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Enter the number in international format, e.g. +90 555 123 4567" });
    }
  })
  .transform((loc) => ({
    kind: loc.kind,
    value: LOCATION_NEEDS_VALUE[loc.kind] === "phone" && loc.value ? loc.value.replace(/[\s()-]/g, "") : LOCATION_NEEDS_VALUE[loc.kind] ? loc.value : null,
  }));

const minutes = (max: number) => z.number().int().min(0).max(max);

// ---------------------------------------------------------------------------- questions (EVT-009)

export const QUESTION_TYPES = ["short_text", "long_text", "number", "email", "phone", "select", "multi_select", "radio", "checkbox", "boolean", "url"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_LABELS: Record<QuestionType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  email: "Email",
  phone: "Phone",
  select: "Dropdown",
  multi_select: "Multiple choice (dropdown)",
  radio: "Radio buttons",
  checkbox: "Checkboxes",
  boolean: "Yes / no",
  url: "Link (URL)",
};
export const QUESTION_HAS_OPTIONS = new Set<QuestionType>(["select", "multi_select", "radio", "checkbox"]);
/** Keys the booking form already uses; custom questions can't take them (BKG-014 prefill). */
export const RESERVED_KEYS = new Set(["name", "email", "notes", "guests", "phone", "duration", "date", "month", "slot", "embed", "reschedule", "token", "link"]);

export const questionSchema = z
  .object({
    key: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9_-]{0,39}$/, "Start with a letter; letters, numbers, - and _ only"),
    type: z.enum(QUESTION_TYPES),
    label: z.string().trim().min(1, "Label is required").max(200),
    placeholder: z.string().trim().max(200).nullable(),
    required: z.boolean(),
    hidden: z.boolean(),
    options: z.array(z.string().trim().max(100)).max(30),
  })
  .superRefine((q, ctx) => {
    if (RESERVED_KEYS.has(q.key)) ctx.addIssue({ code: "custom", path: ["key"], message: "This identifier is reserved" });
    if (QUESTION_HAS_OPTIONS.has(q.type) && !q.options.some(Boolean)) ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least one option" });
    if (q.hidden && q.required) ctx.addIssue({ code: "custom", path: ["required"], message: "A hidden question can't be required" });
  })
  .transform((q) => ({ ...q, options: QUESTION_HAS_OPTIONS.has(q.type) ? [...new Set(q.options.filter(Boolean))] : [] }));
export type Question = z.infer<typeof questionSchema>;

const periodLimits = z
  .object({
    day: z.number().int().min(1).max(10_000).optional(),
    week: z.number().int().min(1).max(10_000).optional(),
    month: z.number().int().min(1).max(100_000).optional(),
    year: z.number().int().min(1).max(1_000_000).optional(),
  })
  .strict();

/** Placeholders for the custom event name (EVT-017). */
export const EVENT_NAME_VARIABLES = ["{event}", "{host}", "{attendee}", "{location}"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, "Letters, numbers and hyphens only");

export const eventTypeFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(100),
    slug: slugSchema,
    description: z.string().max(5000).nullable(),
    durationMinutes: z.number().int().min(5).max(720),
    extraDurations: z.array(z.number().int().min(5).max(720)).max(6),
    slotIntervalMinutes: z.number().int().min(5).max(720).nullable(),
    bufferBeforeMinutes: minutes(240),
    bufferAfterMinutes: minutes(240),
    minNoticeMinutes: minutes(365 * 24 * 60),
    horizonType: z.enum(HORIZON_TYPES),
    horizonDays: z.number().int().min(1).max(730).nullable(),
    rangeStart: isoDate.nullable(),
    rangeEnd: isoDate.nullable(),
    scheduleId: z.string().nullable(),
    locations: z.array(locationSchema).max(6),
    maxGuests: z.number().int().min(0).max(10),
    hidden: z.boolean(),
    questions: z.array(questionSchema).max(30).default([]),
    requiresConfirmation: z.boolean().default(false),
    confirmationThresholdMinutes: z.number().int().min(1).max(365 * 24 * 60).nullable().default(null),
    seatsPerSlot: z.number().int().min(1).max(1000).nullable().default(null),
    seatsShowAttendees: z.boolean().default(false),
    recurringFrequency: z.enum(["weekly", "monthly"]).nullable().default(null),
    recurringMaxCount: z.number().int().min(2).max(52).nullable().default(null),
    bookingLimits: periodLimits.default({}),
    durationLimits: periodLimits.default({}),
    linkOnly: z.boolean().default(false),
    redirectUrl: z.string().trim().max(2000).nullable().default(null),
    redirectForwardParams: z.boolean().default(false),
    eventNameTemplate: z.string().trim().max(200).nullable().default(null),
    disableCancelling: z.boolean().default(false),
    disableRescheduling: z.boolean().default(false),
    cancelCutoffMinutes: z.number().int().min(1).max(30 * 24 * 60).nullable().default(null),
    lockTimeZone: z.string().max(64).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    const rolling = v.horizonType === "rolling_days" || v.horizonType === "rolling_business_days";
    if (rolling && !v.horizonDays) ctx.addIssue({ code: "custom", path: ["horizonDays"], message: "Number of days is required" });
    if (v.horizonType === "date_range") {
      if (!v.rangeStart) ctx.addIssue({ code: "custom", path: ["rangeStart"], message: "Start date is required" });
      if (!v.rangeEnd) ctx.addIssue({ code: "custom", path: ["rangeEnd"], message: "End date is required" });
      if (v.rangeStart && v.rangeEnd && v.rangeEnd < v.rangeStart) {
        ctx.addIssue({ code: "custom", path: ["rangeEnd"], message: "End must be on or after start" });
      }
    }
    if (new Set(v.locations.map((l) => l.kind)).size !== v.locations.length) {
      ctx.addIssue({ code: "custom", path: ["locations"], message: "Each location type can only be added once" });
    }
    if (new Set(v.questions.map((q) => q.key)).size !== v.questions.length) {
      ctx.addIssue({ code: "custom", path: ["questions"], message: "Each question needs its own identifier" });
    }
    if (v.seatsPerSlot && v.recurringFrequency) {
      ctx.addIssue({ code: "custom", path: ["seatsPerSlot"], message: "Seats can't be combined with recurring bookings" });
    }
    if (v.seatsPerSlot && v.requiresConfirmation) {
      ctx.addIssue({ code: "custom", path: ["seatsPerSlot"], message: "Seats can't be combined with requiring confirmation" });
    }
    if (v.recurringFrequency && !v.recurringMaxCount) {
      ctx.addIssue({ code: "custom", path: ["recurringMaxCount"], message: "Set the maximum number of occurrences" });
    }
    if (v.redirectUrl && !/^https:\/\/[^\s]+$/i.test(v.redirectUrl)) {
      ctx.addIssue({ code: "custom", path: ["redirectUrl"], message: "Enter an https:// address" });
    }
    if (v.lockTimeZone && !isValidTimeZone(v.lockTimeZone)) {
      ctx.addIssue({ code: "custom", path: ["lockTimeZone"], message: "Unknown time zone" });
    }
  })
  .transform((v) => ({
    ...v,
    extraDurations: [...new Set(v.extraDurations)].filter((d) => d !== v.durationMinutes).toSorted((a, b) => a - b),
    horizonDays: v.horizonType === "rolling_days" || v.horizonType === "rolling_business_days" ? v.horizonDays : null,
    rangeStart: v.horizonType === "date_range" ? v.rangeStart : null,
    rangeEnd: v.horizonType === "date_range" ? v.rangeEnd : null,
    confirmationThresholdMinutes: v.requiresConfirmation ? v.confirmationThresholdMinutes : null,
    seatsShowAttendees: v.seatsPerSlot ? v.seatsShowAttendees : false,
    recurringMaxCount: v.recurringFrequency ? v.recurringMaxCount : null,
    redirectUrl: v.redirectUrl || null,
    redirectForwardParams: v.redirectUrl ? v.redirectForwardParams : false,
    eventNameTemplate: v.eventNameTemplate || null,
  }));

export type EventTypeForm = z.infer<typeof eventTypeFormSchema>;
export type EventTypeFormInput = z.input<typeof eventTypeFormSchema>;

export function slugify(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/ı/g, "i")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "event"
  );
}

export const DEFAULT_EVENT_TYPE: EventTypeFormInput = {
  title: "",
  slug: "",
  description: null,
  durationMinutes: 30,
  extraDurations: [],
  slotIntervalMinutes: null,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  minNoticeMinutes: 120,
  horizonType: "rolling_days",
  horizonDays: 60,
  rangeStart: null,
  rangeEnd: null,
  scheduleId: null,
  locations: [],
  maxGuests: 5,
  hidden: false,
  questions: [],
  requiresConfirmation: false,
  confirmationThresholdMinutes: null,
  seatsPerSlot: null,
  seatsShowAttendees: false,
  recurringFrequency: null,
  recurringMaxCount: null,
  bookingLimits: {},
  durationLimits: {},
  linkOnly: false,
  redirectUrl: null,
  redirectForwardParams: false,
  eventNameTemplate: null,
  disableCancelling: false,
  disableRescheduling: false,
  cancelCutoffMinutes: null,
  lockTimeZone: null,
};
