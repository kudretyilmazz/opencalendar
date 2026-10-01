CREATE TYPE "public"."instance_asset_kind" AS ENUM('logo', 'logo_dark', 'favicon', 'apple_icon');--> statement-breakpoint
CREATE TYPE "public"."signup_mode" AS ENUM('open', 'invite_only', 'disabled');--> statement-breakpoint
CREATE TABLE "instance_asset" (
	"kind" "instance_asset_kind" PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"mime_type" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"app_name" text,
	"description" text,
	"hide_powered_by" boolean DEFAULT false NOT NULL,
	"hide_source_link" boolean DEFAULT false NOT NULL,
	"theme" jsonb,
	"radius" text,
	"default_theme" "theme_preference",
	"email_footer_text" text,
	"email_button_color" text,
	"signup_mode" "signup_mode",
	"landing_headline" text,
	"landing_body" text,
	"login_message" text,
	"oauth_google_hidden" boolean DEFAULT false NOT NULL,
	"oauth_microsoft_hidden" boolean DEFAULT false NOT NULL,
	"default_time_zone" text,
	"default_week_start" smallint,
	"default_time_format" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "instance_settings_singleton" CHECK ("instance_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "instance_settings" ADD CONSTRAINT "instance_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;