import { sql } from "drizzle-orm";
import { boolean, check, customType, integer, jsonb, pgEnum, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { themePreference } from "./profile";

export const signupModeEnum = pgEnum("signup_mode", ["open", "invite_only", "disabled"]);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Palette overrides per color scheme; validated by features/instance/schemas.ts before saving. */
export type ThemePalette = { primary?: string; highlight?: string };
export type InstanceTheme = { light?: ThemePalette; dark?: ThemePalette };

/**
 * Instance-wide branding and platform settings (ADM-009, ADM-011). A single row (id = 1); every
 * column is nullable and null means "use the built-in default" (features/instance/defaults.ts),
 * so an empty table behaves exactly like an instance that was never customized.
 */
export const instanceSettings = pgTable(
  "instance_settings",
  {
    id: smallint("id").primaryKey().default(1),
    // Branding
    appName: text("app_name"),
    description: text("description"),
    hidePoweredBy: boolean("hide_powered_by").notNull().default(false),
    hideSourceLink: boolean("hide_source_link").notNull().default(false),
    // Theme
    theme: jsonb("theme").$type<InstanceTheme>(),
    radius: text("radius"),
    defaultTheme: themePreference("default_theme"),
    // Email
    emailFooterText: text("email_footer_text"),
    emailButtonColor: text("email_button_color"),
    // Platform
    signupMode: signupModeEnum("signup_mode"),
    landingHeadline: text("landing_headline"),
    landingBody: text("landing_body"),
    loginMessage: text("login_message"),
    oauthGoogleHidden: boolean("oauth_google_hidden").notNull().default(false),
    oauthMicrosoftHidden: boolean("oauth_microsoft_hidden").notNull().default(false),
    defaultTimeZone: text("default_time_zone"),
    defaultWeekStart: smallint("default_week_start"),
    defaultTimeFormat: smallint("default_time_format"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [check("instance_settings_singleton", sql`${t.id} = 1`)],
);

export const instanceAssetKind = pgEnum("instance_asset_kind", ["logo", "logo_dark", "favicon", "apple_icon"]);

/** Uploaded branding images, stored in PostgreSQL so every replica serves the same bytes (ADR-0007). */
export const instanceAsset = pgTable("instance_asset", {
  kind: instanceAssetKind("kind").primaryKey(),
  bytes: bytea("bytes").notNull(),
  mimeType: text("mime_type").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
