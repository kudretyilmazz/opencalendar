import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { membership, user } from "@/db/schema";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { TeamError } from "@/features/teams/server/access";
import { createTeam } from "@/features/teams/server/service";
import { resetDatabase } from "./helpers";

/** Shared setup for the team suites: a team "acme" with an owner, an admin and two members. */

export const NOW = Date.parse("2026-10-01T08:00:00Z"); // Thursday
export const MON = (hhmm: string) => Date.parse(`2026-10-05T${hhmm}:00Z`);
export const booker = (n = 1) => ({ name: `Booker ${n}`, email: `b${n}@example.com`, timeZone: "UTC", locale: "en" });
export const form = (patch: Record<string, unknown> = {}) =>
  eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title: "Intro", slug: "intro", minNoticeMinutes: 0, ...patch });

export async function person(db: Database, id: string, name: string, extra: Partial<typeof user.$inferInsert> = {}) {
  await db.insert(user).values({ id, name, email: `${id}@example.com`, username: id, emailVerified: true, timeZone: "UTC", ...extra });
  await ensureDefaultSchedule(db, id, "UTC");
}

/** "ada" owner, "bob" admin, "cy" and "dee" members of team "acme"; "eve" is an outsider. */
export async function world(db: Database): Promise<string> {
  await resetDatabase(db);
  await db.execute(sql`TRUNCATE "team", "booking", "schedule", "event_type", "workflow" CASCADE`);
  for (const [id, name] of [["ada", "Ada"], ["bob", "Bob"], ["cy", "Cy"], ["dee", "Dee"], ["eve", "Eve"]]) await person(db, id, name);
  const teamId = await createTeam(db, "ada", { name: "Acme", slug: "acme", logoUrl: null, brandColor: null });
  await db.insert(membership).values([
    { teamId, userId: "bob", role: "admin" },
    { teamId, userId: "cy", role: "member" },
    { teamId, userId: "dee", role: "member" },
  ]);
  return teamId;
}

/** "OK", or the error code a promise rejects with. */
export async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof TeamError) return e.detail ? `${e.code}:${e.detail}` : e.code;
    if (e instanceof Error && "code" in e) return String((e as { code: string }).code);
    throw e;
  }
}
