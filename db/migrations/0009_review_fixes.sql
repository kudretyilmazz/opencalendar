CREATE TABLE "captcha_solution" (
	"signature" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendee" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "pending_token_sealed" text;--> statement-breakpoint
CREATE INDEX "captcha_solution_expires_idx" ON "captcha_solution" USING btree ("expires_at");