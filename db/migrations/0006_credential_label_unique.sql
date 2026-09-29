-- Duplicate (user, provider, label) credentials could exist before this index. Nothing is
-- deleted (their calendars and booking references stay intact): older duplicates get a
-- distinguishing label suffix instead.
UPDATE "credential" c SET "label" = c."label" || ' (' || c."id" || ')'
FROM "credential" newer
WHERE c."user_id" = newer."user_id" AND c."provider" = newer."provider" AND c."label" = newer."label"
  AND (c."created_at", c."id") < (newer."created_at", newer."id");--> statement-breakpoint
CREATE UNIQUE INDEX "credential_user_provider_label_uq" ON "credential" USING btree ("user_id","provider","label");--> statement-breakpoint
-- ICS feed URLs are secrets: the calendar row now uses an opaque id; the URL stays encrypted.
UPDATE "connected_calendar" cc SET "external_id" = 'feed'
FROM "credential" c
WHERE cc."credential_id" = c."id" AND c."provider" = 'ics_feed' AND cc."external_id" <> 'feed';
