ALTER TABLE "booking" ADD COLUMN "reschedule_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking" ADD COLUMN "reschedule_request_message" text;