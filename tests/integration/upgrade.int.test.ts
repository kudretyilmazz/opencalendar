import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, describe, expect, inject, it } from "vitest";
import { DEFAULT_MIGRATIONS_FOLDER, runMigrations } from "@/db/migrate";

/**
 * NFR-013 upgrade path: a database created by the previous pre-release (M3, migrations up to
 * 0009) and holding its data is upgraded by the current migrations without manual steps, and
 * the data is intact afterwards. Runs in its own database.
 */

const PREVIOUS_RELEASE_LAST_MIGRATION = "0009_review_fixes";

function migrationsUpTo(tag: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "opencal-migrations-"));
  cpSync(DEFAULT_MIGRATIONS_FOLDER, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { idx: number; tag: string }[] };
  const last = journal.entries.find((e) => e.tag === tag);
  if (!last) throw new Error(`No migration ${tag}`);
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.filter((e) => e.idx <= last.idx) }));
  return dir;
}

const admin = new Pool({ connectionString: inject("databaseUrl"), max: 1 });
const dbName = `upgrade_${Date.now().toString(36)}`;
let pool: Pool | undefined;
const folders: string[] = [];

afterAll(async () => {
  await pool?.end();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin.end();
  for (const f of folders) rmSync(f, { recursive: true, force: true });
});

describe("upgrade from the previous pre-release (NFR-013)", () => {
  it("applies the new migrations on top of an M3 database with data, keeping the data", async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(inject("databaseUrl"));
    url.pathname = `/${dbName}`;
    pool = new Pool({ connectionString: url.toString(), max: 2 });

    const previous = migrationsUpTo(PREVIOUS_RELEASE_LAST_MIGRATION);
    folders.push(previous);
    await runMigrations(pool, previous);

    // Data as the M3 release wrote it.
    await pool.query(`INSERT INTO "user" (id, name, email, email_verified, username) VALUES ('u1', 'Ada', 'ada@example.com', true, 'ada')`);
    await pool.query(`INSERT INTO event_type (id, owner_user_id, title, slug, duration_minutes) VALUES ('et1', 'u1', 'Intro', 'intro', 30)`);
    await pool.query(
      `INSERT INTO booking (id, uid, manage_token_hash, ical_uid, event_type_id, organizer_id, status, title, start_at, end_at, time_zone)
       VALUES ('b1', 'uid1', 'hash', 'ical1', 'et1', 'u1', 'accepted', 'Intro', '2030-01-07T10:00:00Z', '2030-01-07T10:30:00Z', 'UTC')`,
    );
    await pool.query(`INSERT INTO booking_host (booking_id, user_id, blocked_start, blocked_end) VALUES ('b1', 'u1', '2030-01-07T10:00:00Z', '2030-01-07T10:30:00Z')`);
    await pool.query(
      `INSERT INTO workflow (id, owner_user_id, event_type_id, name, trigger, offset_minutes, recipient, subject, body)
       VALUES ('w1', 'u1', 'et1', 'Reminder', 'before_start', 1440, 'attendees', 'S', 'B')`,
    );

    // Upgrade with no manual step, twice (the second run must be a no-op).
    await runMigrations(pool);
    await runMigrations(pool);

    const et = await pool.query(`SELECT team_id, scheduling_type, parent_id, locked_fields, round_robin_window_days FROM event_type WHERE id = 'et1'`);
    expect(et.rows[0]).toEqual({ team_id: null, scheduling_type: null, parent_id: null, locked_fields: [], round_robin_window_days: 30 });
    const b = await pool.query(`SELECT status, assignment_reason, routing_form_response_id, manage_token_sealed FROM booking WHERE id = 'b1'`);
    expect(b.rows[0]).toEqual({ status: "accepted", assignment_reason: null, routing_form_response_id: null, manage_token_sealed: null });
    const w = await pool.query(`SELECT event_type_id, team_id FROM workflow WHERE id = 'w1'`);
    expect(w.rows[0]).toEqual({ event_type_id: "et1", team_id: null });
    // New tables exist and the double-booking constraint still holds.
    const tables = await pool.query(`SELECT to_regclass('team') AS team, to_regclass('routing_form') AS form, to_regclass('event_type_host') AS host`);
    expect(tables.rows[0]).toEqual({ team: "team", form: "routing_form", host: "event_type_host" });
    await expect(
      pool.query(`INSERT INTO booking (id, uid, manage_token_hash, ical_uid, event_type_id, organizer_id, status, title, start_at, end_at, time_zone)
                  VALUES ('b2', 'uid2', 'h', 'i2', 'et1', 'u1', 'accepted', 'X', '2030-01-07T10:15:00Z', '2030-01-07T10:45:00Z', 'UTC');
                  INSERT INTO booking_host (booking_id, user_id, blocked_start, blocked_end) VALUES ('b2', 'u1', '2030-01-07T10:15:00Z', '2030-01-07T10:45:00Z')`),
    ).rejects.toMatchObject({ code: "23P01" });
  });
});
