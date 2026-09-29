-- Custom migration: database-level double-booking protection (BKG-005, NFR-004).
-- A host's active blocked ranges (booking time plus buffers) may never overlap.
ALTER TABLE "booking_host"
  ADD CONSTRAINT "booking_host_no_overlap"
  EXCLUDE USING gist ("user_id" WITH =, tstzrange("blocked_start", "blocked_end", '[)') WITH &&)
  WHERE ("active");
--> statement-breakpoint
ALTER TABLE "booking_host" ADD CONSTRAINT "booking_host_range_order" CHECK ("blocked_end" > "blocked_start");
--> statement-breakpoint
-- Upcoming/active bookings are the hot path for slot computation.
CREATE INDEX IF NOT EXISTS "booking_active_organizer_idx" ON "booking" ("organizer_id", "start_at")
  WHERE "status" IN ('accepted', 'pending', 'awaiting_payment');
