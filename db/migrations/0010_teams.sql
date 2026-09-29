CREATE TYPE "public"."team_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."scheduling_type" AS ENUM('collective', 'round_robin', 'managed');--> statement-breakpoint
CREATE TABLE "membership" (
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "team_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"brand_color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "team_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "team_role" NOT NULL,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_form" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"team_id" text,
	"name" text NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fallback" jsonb NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_form_response" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"answers" jsonb NOT NULL,
	"trace" jsonb NOT NULL,
	"matched_rule_id" text,
	"action" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routing_form_response_answers_object" CHECK (jsonb_typeof("routing_form_response"."answers") = 'object')
);
--> statement-breakpoint
CREATE TABLE "event_type_host" (
	"event_type_id" text NOT NULL,
	"user_id" text NOT NULL,
	"is_fixed" boolean DEFAULT false NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	"priority" smallint DEFAULT 2 NOT NULL,
	"schedule_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_type_host_event_type_id_user_id_pk" PRIMARY KEY("event_type_id","user_id"),
	CONSTRAINT "event_type_host_weight" CHECK ("event_type_host"."weight" BETWEEN 1 AND 1000),
	CONSTRAINT "event_type_host_priority" CHECK ("event_type_host"."priority" BETWEEN 0 AND 4)
);
--> statement-breakpoint
DROP INDEX "event_type_owner_slug_idx";--> statement-breakpoint
ALTER TABLE "workflow" ALTER COLUMN "event_type_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "assignment_reason" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "routing_form_response_id" text;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "scheduling_type" "scheduling_type";--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "locked_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_type" ADD COLUMN "round_robin_window_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitation" ADD CONSTRAINT "team_invitation_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitation" ADD CONSTRAINT "team_invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_form" ADD CONSTRAINT "routing_form_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_form" ADD CONSTRAINT "routing_form_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_form_response" ADD CONSTRAINT "routing_form_response_form_id_routing_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."routing_form"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_type_host" ADD CONSTRAINT "event_type_host_event_type_id_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_type_host" ADD CONSTRAINT "event_type_host_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_type_host" ADD CONSTRAINT "event_type_host_schedule_id_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitation_team_email_idx" ON "team_invitation" USING btree ("team_id","email");--> statement-breakpoint
CREATE INDEX "team_invitation_email_idx" ON "team_invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "routing_form_owner_idx" ON "routing_form" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "routing_form_team_idx" ON "routing_form" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "routing_form_response_form_idx" ON "routing_form_response" USING btree ("form_id","created_at");--> statement-breakpoint
CREATE INDEX "event_type_host_user_idx" ON "event_type_host" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_routing_form_response_id_routing_form_response_id_fk" FOREIGN KEY ("routing_form_response_id") REFERENCES "public"."routing_form_response"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_type" ADD CONSTRAINT "event_type_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_type" ADD CONSTRAINT "event_type_parent_id_event_type_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."event_type"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_type_team_slug_idx" ON "event_type" USING btree ("team_id","slug") WHERE "event_type"."team_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "event_type_parent_idx" ON "event_type" USING btree ("parent_id") WHERE "event_type"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "workflow_team_idx" ON "workflow" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_type_owner_slug_idx" ON "event_type" USING btree ("owner_user_id","slug") WHERE "event_type"."team_id" IS NULL;--> statement-breakpoint
ALTER TABLE "event_type" ADD CONSTRAINT "event_type_team_scheduling" CHECK (("event_type"."team_id" IS NULL) = ("event_type"."scheduling_type" IS NULL));--> statement-breakpoint
ALTER TABLE "event_type" ADD CONSTRAINT "event_type_rr_window" CHECK ("event_type"."round_robin_window_days" BETWEEN 1 AND 365);--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_scope" CHECK (("workflow"."event_type_id" IS NULL) <> ("workflow"."team_id" IS NULL));