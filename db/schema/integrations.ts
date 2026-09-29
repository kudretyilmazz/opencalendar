import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { booking, eventType } from "./scheduling";

/** Integration tables introduced in M2 (docs/03-architecture/integrations.md). */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * A connected account. `encrypted_payload` holds provider tokens or a CalDAV password,
 * AES-256-GCM encrypted with the row id as associated data (INT-001, NFR-007).
 */
export const credential = pgTable(
  "credential",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    /** Human label: account email, CalDAV username@host, or feed host. */
    label: text("label").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    /** Set when the provider rejects the credential (INT-012). */
    invalidAt: timestamp("invalid_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [index("credential_user_idx").on(t.userId), uniqueIndex("credential_user_provider_label_uq").on(t.userId, t.provider, t.label)],
);

export const connectedCalendar = pgTable(
  "connected_calendar",
  {
    id: text("id").primaryKey(),
    credentialId: text("credential_id")
      .notNull()
      .references(() => credential.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    color: text("color"),
    readOnly: boolean("read_only").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    /** Checked for conflicts by default (INT-006). */
    checkConflicts: boolean("check_conflicts").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("connected_calendar_external_idx").on(t.credentialId, t.externalId),
    index("connected_calendar_user_idx").on(t.userId),
  ],
);

/** Default calendar new bookings are written to (INT-007). */
export const destinationCalendar = pgTable("destination_calendar", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  connectedCalendarId: text("connected_calendar_id")
    .notNull()
    .references(() => connectedCalendar.id, { onDelete: "cascade" }),
});

/** Per-event-type conflict calendar override; no rows = use the user's defaults (INT-006). */
export const eventTypeConflictCalendar = pgTable(
  "event_type_conflict_calendar",
  {
    eventTypeId: text("event_type_id")
      .notNull()
      .references(() => eventType.id, { onDelete: "cascade" }),
    connectedCalendarId: text("connected_calendar_id")
      .notNull()
      .references(() => connectedCalendar.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventTypeId, t.connectedCalendarId] })],
);

/** Busy intervals fetched from a calendar for a window (AVL-007). Busy only, never titles. */
export const calendarBusyCache = pgTable(
  "calendar_busy_cache",
  {
    connectedCalendarId: text("connected_calendar_id")
      .notNull()
      .references(() => connectedCalendar.id, { onDelete: "cascade" }),
    rangeStart: timestamp("range_start", { withTimezone: true }).notNull(),
    rangeEnd: timestamp("range_end", { withTimezone: true }).notNull(),
    /** [{ start, end, externalEventId? }] in epoch ms. */
    busy: jsonb("busy").$type<{ start: number; end: number; externalEventId?: string }[]>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.connectedCalendarId, t.rangeStart, t.rangeEnd] }),
    index("calendar_busy_cache_fetched_idx").on(t.fetchedAt),
  ],
);

export const syncStatus = pgEnum("sync_status", ["pending", "synced", "failed"]);

/** External artifacts created for a booking: calendar events and meetings (INT-007/008/009). */
export const bookingReference = pgTable(
  "booking_reference",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    kind: text("kind").notNull(), // "calendar" | "conferencing"
    credentialId: text("credential_id").references(() => credential.id, { onDelete: "set null" }),
    externalCalendarId: text("external_calendar_id"),
    externalId: text("external_id"),
    meetingUrl: text("meeting_url"),
    status: syncStatus("status").notNull().default("pending"),
    lastError: text("last_error"),
    attempts: integer("attempts").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("booking_reference_booking_idx").on(t.bookingId),
    index("booking_reference_external_idx").on(t.externalId).where(sql`${t.externalId} IS NOT NULL`),
  ],
);
