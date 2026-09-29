import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { team } from "./teams";

/**
 * Routing forms (RTE-001…006). Fields, rules and the fallback are stored as validated JSON
 * (`features/routing-forms/schemas.ts`): they are always read and written as a whole, and every
 * response keeps its own trace, so later edits never change what a past submission meant.
 */

export type RoutingFieldType = "text" | "email" | "phone" | "number" | "select" | "multi_select" | "radio";
export type RoutingField = { key: string; label: string; type: RoutingFieldType; required: boolean; options: string[] };
export type RoutingOperator = "equals" | "not_equals" | "contains" | "in" | "gt" | "lt" | "between";
export type RoutingCondition = { field: string; operator: RoutingOperator; value: string[] };
export type RoutingAction =
  | { kind: "event_type"; eventTypeId: string }
  | { kind: "external_url"; url: string }
  | { kind: "message"; message: string };
export type RoutingRule = { id: string; match: "all" | "any"; conditions: RoutingCondition[]; action: RoutingAction };
export type RoutingTraceStep = { ruleId: string; matched: boolean };
export type RoutingAnswers = Record<string, string | string[] | number>;

export const routingForm = pgTable(
  "routing_form",
  {
    id: text("id").primaryKey(),
    /** Owner: a user, or a team (then `ownerUserId` is the creator). */
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => team.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    fields: jsonb("fields").$type<RoutingField[]>().notNull().default([]),
    rules: jsonb("rules").$type<RoutingRule[]>().notNull().default([]),
    /** RTE-003: mandatory. */
    fallback: jsonb("fallback").$type<RoutingAction>().notNull(),
    disabled: boolean("disabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("routing_form_owner_idx").on(t.ownerUserId), index("routing_form_team_idx").on(t.teamId)],
);

/** RTE-005: one row per submission, with the answers, the evaluation trace and the target. */
export const routingFormResponse = pgTable(
  "routing_form_response",
  {
    id: text("id").primaryKey(),
    formId: text("form_id")
      .notNull()
      .references(() => routingForm.id, { onDelete: "cascade" }),
    answers: jsonb("answers").$type<RoutingAnswers>().notNull(),
    trace: jsonb("trace").$type<RoutingTraceStep[]>().notNull(),
    /** null = the fallback applied. */
    matchedRuleId: text("matched_rule_id"),
    action: jsonb("action").$type<RoutingAction>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("routing_form_response_form_idx").on(t.formId, t.createdAt),
    check("routing_form_response_answers_object", sql`jsonb_typeof(${t.answers}) = 'object'`),
  ],
);
