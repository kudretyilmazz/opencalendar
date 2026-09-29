import { boolean, index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const themePreference = pgEnum("theme_preference", ["system", "light", "dark"]);

/** 1:1 profile/booking-page settings for a user (see docs/03-architecture/data-model.md). */
export const profileSettings = pgTable("profile_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  bio: text("bio"),
  brandColor: text("brand_color"),
  darkBrandColor: text("dark_brand_color"),
  theme: themePreference("theme").notNull().default("system"),
  /** TEAM-009: others may book this user in a dynamic group link (/a+b). Off until they opt in. */
  allowDynamicGroup: boolean("allow_dynamic_group").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Failed sign-in attempts per account email, used for temporary lockout (AUTH-004).
 * Rows older than the lockout window are pruned by a maintenance job.
 */
export const loginAttempt = pgTable(
  "login_attempt",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempt_email_created_idx").on(t.email, t.createdAt)],
);
