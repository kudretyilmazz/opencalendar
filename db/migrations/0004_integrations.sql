CREATE TYPE "public"."sync_status" AS ENUM('pending', 'synced', 'failed');--> statement-breakpoint
ALTER TYPE "public"."location_kind" ADD VALUE 'phone_host';--> statement-breakpoint
ALTER TYPE "public"."location_kind" ADD VALUE 'phone_attendee';--> statement-breakpoint
ALTER TYPE "public"."location_kind" ADD VALUE 'jitsi';--> statement-breakpoint
ALTER TYPE "public"."location_kind" ADD VALUE 'google_meet';--> statement-breakpoint
ALTER TYPE "public"."location_kind" ADD VALUE 'ms_teams';--> statement-breakpoint
ALTER TYPE "public"."location_kind" ADD VALUE 'zoom';--> statement-breakpoint
CREATE TABLE "event_type_location" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type_id" text NOT NULL,
	"kind" "location_kind" NOT NULL,
	"value" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"credential_id" text,
	"external_calendar_id" text,
	"external_id" text,
	"meeting_url" text,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_busy_cache" (
	"connected_calendar_id" text NOT NULL,
	"range_start" timestamp with time zone NOT NULL,
	"range_end" timestamp with time zone NOT NULL,
	"busy" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "calendar_busy_cache_connected_calendar_id_range_start_range_end_pk" PRIMARY KEY("connected_calendar_id","range_start","range_end")
);
--> statement-breakpoint
CREATE TABLE "connected_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL,
	"user_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"read_only" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"check_conflicts" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"invalid_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "destination_calendar" (
	"user_id" text PRIMARY KEY NOT NULL,
	"connected_calendar_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_type_conflict_calendar" (
	"event_type_id" text NOT NULL,
	"connected_calendar_id" text NOT NULL,
	CONSTRAINT "event_type_conflict_calendar_event_type_id_connected_calendar_id_pk" PRIMARY KEY("event_type_id","connected_calendar_id")
);
--> statement-breakpoint
ALTER TABLE "attendee" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "destination_calendar_id" text;--> statement-breakpoint
ALTER TABLE "event_type_location" ADD CONSTRAINT "event_type_location_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reference" ADD CONSTRAINT "booking_reference_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reference" ADD CONSTRAINT "booking_reference_credential_id_credential_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credential"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_busy_cache" ADD CONSTRAINT "calendar_busy_cache_connected_calendar_id_connected_calendar_id_fk" FOREIGN KEY ("connected_calendar_id") REFERENCES "public"."connected_calendar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_calendar" ADD CONSTRAINT "connected_calendar_credential_id_credential_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credential"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_calendar" ADD CONSTRAINT "connected_calendar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_calendar" ADD CONSTRAINT "destination_calendar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_calendar" ADD CONSTRAINT "destination_calendar_connected_calendar_id_connected_calendar_id_fk" FOREIGN KEY ("connected_calendar_id") REFERENCES "public"."connected_calendar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_type_conflict_calendar" ADD CONSTRAINT "event_type_conflict_calendar_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_type_conflict_calendar" ADD CONSTRAINT "event_type_conflict_calendar_connected_calendar_id_connected_calendar_id_fk" FOREIGN KEY ("connected_calendar_id") REFERENCES "public"."connected_calendar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_type_location_event_type_idx" ON "event_type_location" USING btree ("event_type_id","position");--> statement-breakpoint
CREATE INDEX "booking_reference_booking_idx" ON "booking_reference" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_reference_external_idx" ON "booking_reference" USING btree ("external_id") WHERE "booking_reference"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "calendar_busy_cache_fetched_idx" ON "calendar_busy_cache" USING btree ("fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connected_calendar_external_idx" ON "connected_calendar" USING btree ("credential_id","external_id");--> statement-breakpoint
CREATE INDEX "connected_calendar_user_idx" ON "connected_calendar" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credential_user_idx" ON "credential" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "event_type" ADD CONSTRAINT "event_type_destination_calendar_id_connected_calendar_id_fk" FOREIGN KEY ("destination_calendar_id") REFERENCES "public"."connected_calendar"("id") ON DELETE set null ON UPDATE no action;