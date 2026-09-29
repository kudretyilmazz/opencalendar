import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { eventType } from "./scheduling";
import { team } from "./teams";

/** M3 automation: email workflows (NTF-005/006) and webhooks (API-001…005). */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const workflowTrigger = pgEnum("workflow_trigger", ["booking_created", "booking_cancelled", "booking_rescheduled", "before_start", "after_end"]);
export const workflowRecipient = pgEnum("workflow_recipient", ["host", "attendees", "address"]);

/**
 * One email step per workflow, attached to one event type. Timed triggers use `offsetMinutes`
 * (before start / after end). Reminders are scheduled as delayed jobs that re-check the booking
 * when they fire, so reschedules and cancellations need no bookkeeping here.
 */
export const workflow = pgTable(
  "workflow",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Exactly one of: an event type, or a team (then it applies to all its event types, NTF-007). */
    eventTypeId: text("event_type_id").references(() => eventType.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trigger: workflowTrigger("trigger").notNull(),
    offsetMinutes: integer("offset_minutes").notNull().default(0),
    recipient: workflowRecipient("recipient").notNull(),
    /** Fixed recipient when `recipient` = address. */
    address: text("address"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** The 24-hour reminder every new event type gets (NTF-006). */
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("workflow_event_type_idx").on(t.eventTypeId),
    index("workflow_team_idx").on(t.teamId),
    check("workflow_scope", sql`(${t.eventTypeId} IS NULL) <> (${t.teamId} IS NULL)`),
    check("workflow_offset_range", sql`${t.offsetMinutes} BETWEEN 0 AND 43200`),
    check("workflow_address_needed", sql`${t.recipient} <> 'address' OR ${t.address} IS NOT NULL`),
  ],
);

export const webhookDeliveryStatus = pgEnum("webhook_delivery_status", ["pending", "success", "failed"]);

/**
 * Webhook subscriptions (API-001). Scope: a team (`teamId`: all of the team's event types, managed
 * by its admins; `ownerUserId` is then the creator), one event type (`eventTypeId`), or else every
 * personal event type of the owner.
 */
export const webhook = pgTable(
  "webhook",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventTypeId: text("event_type_id").references(() => eventType.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** HMAC secret, AES-256-GCM encrypted with the row id as AAD (API-002). */
    encryptedSecret: text("encrypted_secret").notNull(),
    triggers: text("triggers").array().notNull(),
    active: boolean("active").notNull().default(true),
    payloadVersion: integer("payload_version").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("webhook_owner_idx").on(t.ownerUserId),
    index("webhook_team_idx").on(t.teamId),
    check("webhook_team_or_event_type", sql`${t.teamId} IS NULL OR ${t.eventTypeId} IS NULL`),
  ],
);

/** Delivery log (API-003): one row per event and subscription, updated on every attempt. */
export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhook.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    payload: jsonb("payload").notNull(),
    status: webhookDeliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("webhook_delivery_webhook_created_idx").on(t.webhookId, t.createdAt)],
);

/** Used ALTCHA solutions (ADM-007): one row per challenge signature until it expires. */
export const captchaSolution = pgTable(
  "captcha_solution",
  {
    signature: text("signature").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("captcha_solution_expires_idx").on(t.expiresAt)],
);
