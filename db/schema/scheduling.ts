import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { connectedCalendar } from "./integrations";
import { routingFormResponse } from "./routing";
import { team } from "./teams";

/** Scheduling tables introduced in M1 (docs/03-architecture/data-model.md). */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------- availability

export const schedule = pgTable(
  "schedule",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    timeZone: text("time_zone").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("schedule_user_idx").on(t.userId),
    uniqueIndex("schedule_one_default_per_user").on(t.userId).where(sql`${t.isDefault}`),
  ],
);

export const scheduleRule = pgTable(
  "schedule_rule",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => schedule.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(), // 0 = Sunday
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(), // 00:00 = 24:00
  },
  (t) => [
    index("schedule_rule_schedule_weekday_idx").on(t.scheduleId, t.weekday),
    check("schedule_rule_weekday_range", sql`${t.weekday} BETWEEN 0 AND 6`),
    check("schedule_rule_order", sql`${t.endTime} > ${t.startTime} OR ${t.endTime} = '00:00'`),
  ],
);

export const dateOverride = pgTable(
  "date_override",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => schedule.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    // Both null = unavailable all day. Several rows per date = several ranges.
    startTime: time("start_time"),
    endTime: time("end_time"),
  },
  (t) => [
    index("date_override_schedule_date_idx").on(t.scheduleId, t.date),
    check("date_override_both_or_neither", sql`(${t.startTime} IS NULL) = (${t.endTime} IS NULL)`),
  ],
);

// ---------------------------------------------------------------------------- event types

export const horizonType = pgEnum("horizon_type", ["rolling_days", "rolling_business_days", "date_range", "unlimited"]);
export const recurringFrequency = pgEnum("recurring_frequency", ["weekly", "monthly"]);
/** TEAM-004/005/008: how a team event type assigns hosts. Personal event types have none. */
export const schedulingType = pgEnum("scheduling_type", ["collective", "round_robin", "managed"]);

/** Max bookings (EVT-010 frequency) or booked minutes (duration) per period, in the schedule's zone. */
export type PeriodLimits = { day?: number; week?: number; month?: number; year?: number };
/**
 * Location kinds (EVT-007/008, INT-008..011). "phone" is the M1 value and means the same as
 * "phone_host" (the attendee calls the host's number).
 */
export const locationKind = pgEnum("location_kind", [
  "in_person",
  "phone",
  "link",
  "phone_host",
  "phone_attendee",
  "jitsi",
  "google_meet",
  "ms_teams",
  "zoom",
]);

export const eventType = pgTable(
  "event_type",
  {
    id: text("id").primaryKey(),
    /** Personal event types: the host. Team event types: the creator (the team owns it). */
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // M4 teams ------------------------------------------------------------------
    teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
    schedulingType: schedulingType("scheduling_type"),
    /** Managed event types (TEAM-008): a member's copy points at the team template. */
    parentId: text("parent_id").references((): AnyPgColumn => eventType.id, { onDelete: "cascade" }),
    /** Template only: form fields members can't change on their copy. */
    lockedFields: jsonb("locked_fields").$type<string[]>().notNull().default([]),
    /** TEAM-005: round robin counts each host's bookings over this many recent days. */
    roundRobinWindowDays: integer("round_robin_window_days").notNull().default(30),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    slotIntervalMinutes: integer("slot_interval_minutes"),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(0),
    horizonType: horizonType("horizon_type").notNull().default("rolling_days"),
    horizonDays: integer("horizon_days").default(60),
    rangeStart: date("range_start", { mode: "string" }),
    rangeEnd: date("range_end", { mode: "string" }),
    scheduleId: text("schedule_id").references(() => schedule.id, { onDelete: "set null" }),
    /** Overrides the owner's default destination calendar (INT-007). */
    destinationCalendarId: text("destination_calendar_id").references(() => connectedCalendar.id, { onDelete: "set null" }),
    maxGuests: integer("max_guests").notNull().default(5),
    hidden: boolean("hidden").notNull().default(false),
    // M3 booking power features ----------------------------------------------
    /** EVT-011: new bookings are pending until the host accepts… */
    requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
    /** …optionally only when the booking starts within this many minutes. */
    confirmationThresholdMinutes: integer("confirmation_threshold_minutes"),
    /** EVT-012: attendees per slot; null = not a seated event. */
    seatsPerSlot: integer("seats_per_slot"),
    seatsShowAttendees: boolean("seats_show_attendees").notNull().default(false),
    /** EVT-013: bookers may book a series of up to `recurringMaxCount` occurrences. */
    recurringFrequency: recurringFrequency("recurring_frequency"),
    recurringMaxCount: integer("recurring_max_count"),
    /** EVT-010 */
    bookingLimits: jsonb("booking_limits").$type<PeriodLimits>().notNull().default({}),
    durationLimits: jsonb("duration_limits").$type<PeriodLimits>().notNull().default({}),
    /** EVT-015: only bookable through a single-use private link. */
    linkOnly: boolean("link_only").notNull().default(false),
    /** EVT-016 */
    redirectUrl: text("redirect_url"),
    redirectForwardParams: boolean("redirect_forward_params").notNull().default(false),
    /** EVT-017 policies */
    eventNameTemplate: text("event_name_template"),
    disableCancelling: boolean("disable_cancelling").notNull().default(false),
    disableRescheduling: boolean("disable_rescheduling").notNull().default(false),
    cancelCutoffMinutes: integer("cancel_cutoff_minutes"),
    lockTimeZone: text("lock_time_zone"),
    enabled: boolean("enabled").notNull().default(true),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("event_type_owner_slug_idx").on(t.ownerUserId, t.slug).where(sql`${t.teamId} IS NULL`),
    uniqueIndex("event_type_team_slug_idx").on(t.teamId, t.slug).where(sql`${t.teamId} IS NOT NULL`),
    index("event_type_parent_idx").on(t.parentId).where(sql`${t.parentId} IS NOT NULL`),
    check("event_type_team_scheduling", sql`(${t.teamId} IS NULL) = (${t.schedulingType} IS NULL)`),
    check("event_type_rr_window", sql`${t.roundRobinWindowDays} BETWEEN 1 AND 365`),
    index("event_type_owner_position_idx").on(t.ownerUserId, t.position),
    check("event_type_duration_positive", sql`${t.durationMinutes} > 0 AND ${t.durationMinutes} <= 1440`),
    check("event_type_interval_positive", sql`${t.slotIntervalMinutes} IS NULL OR ${t.slotIntervalMinutes} > 0`),
    check(
      "event_type_non_negative",
      sql`${t.bufferBeforeMinutes} >= 0 AND ${t.bufferAfterMinutes} >= 0 AND ${t.minNoticeMinutes} >= 0 AND ${t.maxGuests} >= 0`,
    ),
    check("event_type_seats_positive", sql`${t.seatsPerSlot} IS NULL OR ${t.seatsPerSlot} BETWEEN 1 AND 1000`),
    check(
      "event_type_recurring_pair",
      sql`(${t.recurringFrequency} IS NULL) = (${t.recurringMaxCount} IS NULL) AND (${t.recurringMaxCount} IS NULL OR ${t.recurringMaxCount} BETWEEN 2 AND 52)`,
    ),
  ],
);

export const questionType = pgEnum("question_type", [
  "short_text",
  "long_text",
  "number",
  "email",
  "phone",
  "select",
  "multi_select",
  "radio",
  "checkbox",
  "boolean",
  "url",
]);

/** Custom booking questions (EVT-009). Name and email are built in and never stored here. */
export const eventTypeQuestion = pgTable(
  "event_type_question",
  {
    id: text("id").primaryKey(),
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventType.id, { onDelete: "cascade" }),
    /** Stable answer key, also the URL prefill parameter (BKG-014). */
    key: text("key").notNull(),
    type: questionType("type").notNull(),
    label: text("label").notNull(),
    placeholder: text("placeholder"),
    required: boolean("required").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    position: integer("position").notNull().default(0),
  },
  (t) => [uniqueIndex("event_type_question_key_idx").on(t.eventTypeId, t.key), index("event_type_question_position_idx").on(t.eventTypeId, t.position)],
);

/** Single-use private links (EVT-015). Only the token hash is used for lookup. */
export const privateLink = pgTable(
  "private_link",
  {
    id: text("id").primaryKey(),
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventType.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** Encrypted token, so the host can copy the link again. */
    encryptedToken: text("encrypted_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    bookingId: text("booking_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("private_link_event_type_idx").on(t.eventTypeId)],
);

/** Locations a booker can choose from, in display order (EVT-008). */
export const eventTypeLocation = pgTable(
  "event_type_location",
  {
    id: text("id").primaryKey(),
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventType.id, { onDelete: "cascade" }),
    kind: locationKind("kind").notNull(),
    /** Address, URL or host phone number, depending on the kind. */
    value: text("value"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("event_type_location_event_type_idx").on(t.eventTypeId, t.position)],
);

/** Extra selectable durations besides the default `duration_minutes` (EVT-002). */
export const eventTypeDurationOption = pgTable(
  "event_type_duration_option",
  {
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventType.id, { onDelete: "cascade" }),
    durationMinutes: integer("duration_minutes").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventTypeId, t.durationMinutes] }),
    check("duration_option_positive", sql`${t.durationMinutes} > 0 AND ${t.durationMinutes} <= 1440`),
  ],
);

/**
 * Hosts of a team event type (TEAM-004…007). Collective: everyone. Round robin: fixed hosts
 * always attend, one of the others is picked per booking by weight and priority.
 */
export const eventTypeHost = pgTable(
  "event_type_host",
  {
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventType.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    isFixed: boolean("is_fixed").notNull().default(false),
    weight: integer("weight").notNull().default(100),
    /** 0 lowest … 4 highest; the round-robin tiebreaker (TEAM-006). */
    priority: smallint("priority").notNull().default(2),
    /** null = the host's default schedule. */
    scheduleId: text("schedule_id").references(() => schedule.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.eventTypeId, t.userId] }),
    index("event_type_host_user_idx").on(t.userId),
    check("event_type_host_weight", sql`${t.weight} BETWEEN 1 AND 1000`),
    check("event_type_host_priority", sql`${t.priority} BETWEEN 0 AND 4`),
  ],
);

// ---------------------------------------------------------------------------- bookings

export const bookingStatus = pgEnum("booking_status", ["accepted", "pending", "awaiting_payment", "cancelled", "rejected"]);
export const cancelledBy = pgEnum("cancelled_by", ["attendee", "host", "system"]);
export const bookingSource = pgEnum("booking_source", ["web", "embed", "api", "reschedule"]);

export const booking = pgTable(
  "booking",
  {
    id: text("id").primaryKey(),
    /** Public, unguessable identifier (BKG-011). */
    uid: text("uid").notNull().unique(),
    /** SHA-256 of the manage-link token; the token itself is only ever emailed. */
    manageTokenHash: text("manage_token_hash").notNull(),
    /** Stable iCalendar UID shared by a booking and its reschedules (NTF-003). */
    icalUid: text("ical_uid").notNull(),
    sequence: integer("sequence").notNull().default(0),
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventType.id, { onDelete: "cascade" }),
    organizerId: text("organizer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: bookingStatus("status").notNull(),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    /** Buffers in effect when booked; part of the host's blocked range. */
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    timeZone: text("time_zone").notNull(),
    locationKind: locationKind("location_kind"),
    locationValue: text("location_value"),
    notes: text("notes"),
    rescheduledFromId: text("rescheduled_from_id"),
    rescheduled: boolean("rescheduled").notNull().default(false),
    cancellationReason: text("cancellation_reason"),
    cancelledBy: cancelledBy("cancelled_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    source: bookingSource("source").notNull().default("web"),
    /** Answers to the event type's questions, by question key (EVT-009). */
    responses: jsonb("responses").$type<Record<string, string | string[] | boolean | number>>().notNull().default({}),
    /** utm_* parameters from the booking page URL (BKG-014). */
    utm: jsonb("utm").$type<Record<string, string>>(),
    /** Occurrences of one recurring booking share this id (EVT-013). */
    recurringSeriesId: text("recurring_series_id"),
    /** BKG-013 */
    hostNoShow: boolean("host_no_show").notNull().default(false),
    /** Set when a pending booking is accepted or rejected (BKG-012). */
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    /**
     * Pending bookings only: the booker's manage token, encrypted (row id as AAD), so the
     * acceptance email can carry the manage link. Cleared when the host decides (BKG-012).
     */
    pendingTokenSealed: text("pending_token_sealed"),
    /**
     * The booker's manage token, encrypted (row id as AAD), so reminder and workflow emails can
     * carry working cancel/reschedule links (NTF-005). Lookups still use the hash only.
     */
    manageTokenSealed: text("manage_token_sealed"),
    /** Round robin (TEAM-006): why this host was picked, for "why did Alice get this?". */
    assignmentReason: text("assignment_reason"),
    /** RTE-004: the routing-form submission that led here. */
    routingFormResponseId: text("routing_form_response_id").references(() => routingFormResponse.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("booking_organizer_start_idx").on(t.organizerId, t.startAt),
    index("booking_event_type_start_idx").on(t.eventTypeId, t.startAt),
    index("booking_recurring_series_idx").on(t.recurringSeriesId).where(sql`${t.recurringSeriesId} IS NOT NULL`),
    uniqueIndex("booking_idempotency_idx").on(t.eventTypeId, t.idempotencyKey),
    check("booking_time_order", sql`${t.endAt} > ${t.startAt}`),
  ],
);

export const attendee = pgTable(
  "attendee",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    timeZone: text("time_zone").notNull(),
    locale: text("locale").notNull().default("en"),
    /** Collected when the host calls the attendee (INT-011). */
    phone: text("phone"),
    isGuest: boolean("is_guest").notNull().default(false),
    /** Seated events (EVT-012): each seat has its own manage token; null otherwise. */
    seatTokenHash: text("seat_token_hash"),
    /** Seat-specific answers and notes; a seated booking row keeps neither (privacy, EVT-012). */
    responses: jsonb("responses").$type<Record<string, string | string[] | boolean | number>>(),
    notes: text("notes"),
    noShow: boolean("no_show").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attendee_booking_idx").on(t.bookingId),
    index("attendee_email_idx").on(t.email),
    uniqueIndex("attendee_seat_token_idx").on(t.seatTokenHash).where(sql`${t.seatTokenHash} IS NOT NULL`),
  ],
);

/**
 * One row per (booking, host) with the host's blocked range, buffers included. The exclusion
 * constraint `booking_host_no_overlap` (custom migration) makes double booking impossible at the
 * database level (BKG-005, NFR-004).
 */
export const bookingHost = pgTable(
  "booking_host",
  {
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blockedStart: timestamp("blocked_start", { withTimezone: true }).notNull(),
    blockedEnd: timestamp("blocked_end", { withTimezone: true }).notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.bookingId, t.userId] })],
);

/** Temporary hold on a slot while a booker fills in the form (BKG-006). */
export const slotReservation = pgTable(
  "slot_reservation",
  {
    id: text("id").primaryKey(),
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventType.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    sessionTokenHash: text("session_token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("slot_reservation_user_expires_idx").on(t.userId, t.expiresAt),
    uniqueIndex("slot_reservation_session_idx").on(t.sessionTokenHash),
  ],
);
