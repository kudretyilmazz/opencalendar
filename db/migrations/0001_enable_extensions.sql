-- Custom migration: extensions drizzle-kit cannot express.
-- btree_gist enables the booking exclusion constraint (tstzrange && per host) added in M1.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- Case-insensitive uniqueness for usernames and emails.
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_lower_idx" ON "user" (lower("email"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_username_lower_idx" ON "user" (lower("username"));
