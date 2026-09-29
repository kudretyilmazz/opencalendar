CREATE TYPE "public"."booking_source" AS ENUM('web', 'embed', 'api', 'reschedule');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('accepted', 'pending', 'awaiting_payment', 'cancelled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."cancelled_by" AS ENUM('attendee', 'host', 'system');--> statement-breakpoint
CREATE TYPE "public"."horizon_type" AS ENUM('rolling_days', 'rolling_business_days', 'date_range', 'unlimited');--> statement-breakpoint
CREATE TYPE "public"."location_kind" AS ENUM('in_person', 'phone', 'link');--> statement-breakpoint
CREATE TABLE "attendee" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"time_zone" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"is_guest" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" text PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"manage_token_hash" text NOT NULL,
	"ical_uid" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"event_type_id" text NOT NULL,
	"organizer_id" text NOT NULL,
	"status" "booking_status" NOT NULL,
	"title" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"time_zone" text NOT NULL,
	"location_kind" "location_kind",
	"location_value" text,
	"notes" text,
	"rescheduled_from_id" text,
	"rescheduled" boolean DEFAULT false NOT NULL,
	"cancellation_reason" text,
	"cancelled_by" "cancelled_by",
	"cancelled_at" timestamp with time zone,
	"idempotency_key" text,
	"source" "booking_source" DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_uid_unique" UNIQUE("uid"),
	CONSTRAINT "booking_time_order" CHECK ("booking"."end_at" > "booking"."start_at")
);
--> statement-breakpoint
CREATE TABLE "booking_host" (
	"booking_id" text NOT NULL,
	"user_id" text NOT NULL,
	"blocked_start" timestamp with time zone NOT NULL,
	"blocked_end" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "booking_host_booking_id_user_id_pk" PRIMARY KEY("booking_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "date_override" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	CONSTRAINT "date_override_both_or_neither" CHECK (("date_override"."start_time" IS NULL) = ("date_override"."end_time" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "event_type" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"duration_minutes" integer NOT NULL,
	"slot_interval_minutes" integer,
	"buffer_before_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_after_minutes" integer DEFAULT 0 NOT NULL,
	"min_notice_minutes" integer DEFAULT 0 NOT NULL,
	"horizon_type" "horizon_type" DEFAULT 'rolling_days' NOT NULL,
	"horizon_days" integer DEFAULT 60,
	"range_start" date,
	"range_end" date,
	"schedule_id" text,
	"location_kind" "location_kind",
	"location_value" text,
	"max_guests" integer DEFAULT 5 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_type_duration_positive" CHECK ("event_type"."duration_minutes" > 0 AND "event_type"."duration_minutes" <= 1440),
	CONSTRAINT "event_type_interval_positive" CHECK ("event_type"."slot_interval_minutes" IS NULL OR "event_type"."slot_interval_minutes" > 0),
	CONSTRAINT "event_type_non_negative" CHECK ("event_type"."buffer_before_minutes" >= 0 AND "event_type"."buffer_after_minutes" >= 0 AND "event_type"."min_notice_minutes" >= 0 AND "event_type"."max_guests" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_type_duration_option" (
	"event_type_id" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	CONSTRAINT "event_type_duration_option_event_type_id_duration_minutes_pk" PRIMARY KEY("event_type_id","duration_minutes"),
	CONSTRAINT "duration_option_positive" CHECK ("event_type_duration_option"."duration_minutes" > 0 AND "event_type_duration_option"."duration_minutes" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "schedule_rule_weekday_range" CHECK ("schedule_rule"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "schedule_rule_order" CHECK ("schedule_rule"."end_time" > "schedule_rule"."start_time" OR "schedule_rule"."end_time" = '00:00')
);
--> statement-breakpoint
CREATE TABLE "slot_reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type_id" text NOT NULL,
	"user_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"session_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendee" ADD CONSTRAINT "attendee_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_organizer_id_user_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_host" ADD CONSTRAINT "booking_host_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_host" ADD CONSTRAINT "booking_host_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_override" ADD CONSTRAINT "date_override_schedule_id_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_type" ADD CONSTRAINT "event_type_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_type" ADD CONSTRAINT "event_type_schedule_id_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_type_duration_option" ADD CONSTRAINT "event_type_duration_option_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rule" ADD CONSTRAINT "schedule_rule_schedule_id_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedule"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_reservation" ADD CONSTRAINT "slot_reservation_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_reservation" ADD CONSTRAINT "slot_reservation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendee_booking_idx" ON "attendee" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "attendee_email_idx" ON "attendee" USING btree ("email");--> statement-breakpoint
CREATE INDEX "booking_organizer_start_idx" ON "booking" USING btree ("organizer_id","start_at");--> statement-breakpoint
CREATE INDEX "booking_event_type_start_idx" ON "booking" USING btree ("event_type_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_idempotency_idx" ON "booking" USING btree ("event_type_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "date_override_schedule_date_idx" ON "date_override" USING btree ("schedule_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "event_type_owner_slug_idx" ON "event_type" USING btree ("owner_user_id","slug");--> statement-breakpoint
CREATE INDEX "event_type_owner_position_idx" ON "event_type" USING btree ("owner_user_id","position");--> statement-breakpoint
CREATE INDEX "schedule_user_idx" ON "schedule" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_one_default_per_user" ON "schedule" USING btree ("user_id") WHERE "schedule"."is_default";--> statement-breakpoint
CREATE INDEX "schedule_rule_schedule_weekday_idx" ON "schedule_rule" USING btree ("schedule_id","weekday");--> statement-breakpoint
CREATE INDEX "slot_reservation_user_expires_idx" ON "slot_reservation" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_reservation_session_idx" ON "slot_reservation" USING btree ("session_token_hash");