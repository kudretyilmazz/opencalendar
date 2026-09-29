import { index, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** M4 teams (TEAM-001…003): teams, accepted memberships and pending email invitations. */

export const teamRole = pgEnum("team_role", ["owner", "admin", "member"]);

export const team = pgTable("team", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Public page at /team/{slug}. */
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Accepted members only; invitations live in `team_invitation` until accepted. */
export const membership = pgTable(
  "membership",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: teamRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("membership_user_idx").on(t.userId)],
);

/**
 * TEAM-002: an invitation is addressed to an email. Only a signed-in user whose *verified* email
 * matches can accept it, so no bearer token is needed (the email only links to the dashboard).
 */
export const teamInvitation = pgTable(
  "team_invitation",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    /** Always stored lower-case. */
    email: text("email").notNull(),
    role: teamRole("role").notNull(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("team_invitation_team_email_idx").on(t.teamId, t.email), index("team_invitation_email_idx").on(t.email)],
);
