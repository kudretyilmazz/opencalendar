-- Move the single M1 location into event_type_location (EVT-008), then drop the old columns.
-- "phone" is kept as-is: new enum values can't be used in the transaction that added them,
-- and "phone" means the same as "phone_host".
INSERT INTO "event_type_location" ("id", "event_type_id", "kind", "value", "position")
SELECT gen_random_uuid()::text, "id", "location_kind", "location_value", 0
FROM "event_type"
WHERE "location_kind" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "event_type" DROP COLUMN "location_kind";--> statement-breakpoint
ALTER TABLE "event_type" DROP COLUMN "location_value";
