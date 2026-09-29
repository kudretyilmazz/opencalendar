CREATE TYPE "public"."question_type" AS ENUM('short_text', 'long_text', 'number', 'email', 'phone', 'select', 'multi_select', 'radio', 'checkbox', 'boolean', 'url');--> statement-breakpoint
CREATE TYPE "public"."recurring_frequency" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workflow_recipient" AS ENUM('host', 'attendees', 'address');--> statement-breakpoint
CREATE TYPE "public"."workflow_trigger" AS ENUM('booking_created', 'booking_cancelled', 'booking_rescheduled', 'before_start', 'after_end');--> statement-breakpoint
CREATE TABLE "event_type_question" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type_id" text NOT NULL,
	"key" text NOT NULL,
	"type" "question_type" NOT NULL,
	"label" text NOT NULL,
	"placeholder" text,
	"required" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_link" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"booking_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_link_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"event_type_id" text,
	"url" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"triggers" text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"payload_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"trigger" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"event_type_id" text NOT NULL,
	"name" text NOT NULL,
	"trigger" "workflow_trigger" NOT NULL,
	"offset_minutes" integer DEFAULT 0 NOT NULL,
	"recipient" "workflow_recipient" NOT NULL,
	"address" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_offset_range" CHECK ("workflow"."offset_minutes" BETWEEN 0 AND 43200),
	CONSTRAINT "workflow_address_needed" CHECK ("workflow"."recipient" <> 'address' OR "workflow"."address" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "attendee" ADD COLUMN "seat_token_hash" text;--> statement-breakpoint
ALTER TABLE "attendee" ADD COLUMN "responses" jsonb;--> statement-breakpoint
ALTER TABLE "attendee" ADD COLUMN "no_show" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "responses" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "utm" jsonb;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "recurring_series_id" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "host_no_show" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "requires_confirmation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "confirmation_threshold_minutes" integer;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "seats_per_slot" integer;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "seats_show_attendees" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "recurring_frequency" "recurring_frequency";--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "recurring_max_count" integer;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "booking_limits" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "duration_limits" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "redirect_url" text;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "redirect_forward_params" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "event_name_template" text;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "disable_cancelling" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "disable_rescheduling" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "cancel_cutoff_minutes" integer;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "lock_time_zone" text;--> statement-breakpoint
ALTER TABLE "event_type_question" ADD CONSTRAINT "event_type_question_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_link" ADD CONSTRAINT "private_link_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_webhook_id_webhook_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_type_question_key_idx" ON "event_type_question" USING btree ("event_type_id","key");--> statement-breakpoint
CREATE INDEX "event_type_question_position_idx" ON "event_type_question" USING btree ("event_type_id","position");--> statement-breakpoint
CREATE INDEX "private_link_event_type_idx" ON "private_link" USING btree ("event_type_id");--> statement-breakpoint
CREATE INDEX "webhook_owner_idx" ON "webhook" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_webhook_created_idx" ON "webhook_delivery" USING btree ("webhook_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_event_type_idx" ON "workflow" USING btree ("event_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendee_seat_token_idx" ON "attendee" USING btree ("seat_token_hash") WHERE "attendee"."seat_token_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "booking_recurring_series_idx" ON "booking" USING btree ("recurring_series_id") WHERE "booking"."recurring_series_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "event_type" ADD CONSTRAINT "event_type_seats_positive" CHECK ("event_type"."seats_per_slot" IS NULL OR "event_type"."seats_per_slot" BETWEEN 1 AND 1000);--> statement-breakpoint
ALTER TABLE "event_type" ADD CONSTRAINT "event_type_recurring_pair" CHECK (("event_type"."recurring_frequency" IS NULL) = ("event_type"."recurring_max_count" IS NULL) AND ("event_type"."recurring_max_count" IS NULL OR "event_type"."recurring_max_count" BETWEEN 2 AND 52));