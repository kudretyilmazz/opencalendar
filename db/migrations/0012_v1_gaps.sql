ALTER TABLE "booking" ADD COLUMN "manage_token_sealed" text;--> statement-breakpoint
ALTER TABLE "webhook" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_team_idx" ON "webhook" USING btree ("team_id");--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_team_or_event_type" CHECK ("webhook"."team_id" IS NULL OR "webhook"."event_type_id" IS NULL);