/**
 * Fills the README demo account ("Alex Rivera") with realistic, fictional data. Run by
 * capture.spec.ts after the account has signed up through the UI; only touches that account and
 * the two demo teammates it creates. Local development databases only.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { attendee, membership, team, user } from "@/db/schema";
import { deleteAccount } from "@/features/account/server/service";
import { createBooking } from "@/features/bookings/server/service";
import { DEFAULT_EVENT_TYPE, eventTypeFormSchema } from "@/features/event-types/schemas";
import { createEventType, findPublicEventType, findPublicHost } from "@/features/event-types/server/service";
import { createSchedule, ensureDefaultSchedule, updateSchedule } from "@/features/schedules/server/service";
import { createTeam } from "@/features/teams/server/service";
import { addDays, formatDate, localDateOf, localParts, wallToUtc } from "@/lib/availability/tz";

const HOUR = 3_600_000;
const TEAMMATES = [
  { id: "demo-teammate-olga", name: "Olga Novak", email: "olga@demo.opencalendar.test" },
  { id: "demo-teammate-rui", name: "Rui Santos", email: "rui@demo.opencalendar.test" },
];

type LocationKind = "jitsi" | "phone_attendee" | "in_person";

const teamSlug = (username: string) => `northwind-${username}`;

/** Removes a previous run's demo account, its team and the demo teammates. */
async function reset(email: string, username: string): Promise<void> {
  const db = getDb();
  await db.delete(team).where(eq(team.slug, teamSlug(username)));
  await db.delete(user).where(inArray(user.id, TEAMMATES.map((t) => t.id)));
  const [previous] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (previous) await deleteAccount(db, previous.id, Date.now());
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const resetOnly = args[0] === "--reset";
  const [email, username, TZ = "Europe/Istanbul"] = resetOnly ? args.slice(1) : args;
  if (!email || !username) throw new Error("usage: seed.ts [--reset] <email> <username> [timeZone]");
  if (resetOnly) return reset(email, username);
  const db = getDb();

  const [host] = await db.select().from(user).where(eq(user.email, email));
  if (!host) throw new Error(`No account for ${email}`);
  await db.update(user).set({ username, timeZone: TZ, weekStart: 1, timeFormat: 24 }).where(eq(user.id, host.id));

  // Bookable around the clock while seeding, so bookings can land "today" whatever the time.
  const scheduleId = await ensureDefaultSchedule(db, host.id, TZ);
  const allDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: "00:00", end: "00:00" }));
  await updateSchedule(db, host.id, scheduleId, { name: "Working hours", timeZone: TZ, rules: allDay, overrides: [] });

  const make = (title: string, slug: string, durationMinutes: number, extra: Record<string, unknown>) =>
    createEventType(db, host.id, eventTypeFormSchema.parse({ ...DEFAULT_EVENT_TYPE, title, slug, durationMinutes, minNoticeMinutes: 0, ...extra }));
  await make("Intro call", "intro", 15, {
    description: "A quick hello to see whether we're a good fit.",
    locations: [{ kind: "phone_attendee", value: null }],
  });
  await make("Product demo", "demo", 30, {
    description: "A guided tour of the product, tailored to your team.",
    extraDurations: [45, 60],
    locations: [{ kind: "jitsi", value: null }],
  });
  await make("Consultation", "consultation", 60, {
    description: "A deep dive into your workflow. I'll confirm within a day.",
    requiresConfirmation: true,
    locations: [{ kind: "jitsi", value: null }],
  });
  await make("Office hours", "office-hours", 45, { hidden: true, locations: [{ kind: "in_person", value: "Main office" }] });

  const found = await findPublicHost(db, username);
  if (!found) throw new Error("Host has no public page");
  const publicHost = found;
  const now = Date.now();
  const today = localDateOf(now, TZ);
  const at = (dayOffset: number, hour: number, minute = 0) => wallToUtc(addDays(today, dayOffset), hour * 60 + minute, TZ);
  async function book(slug: string, start: number, name: string, kind: LocationKind, bookedAt = now) {
    const eventType = await findPublicEventType(db, publicHost.id, slug);
    if (!eventType) throw new Error(`No event type ${slug}`);
    const phone = kind === "phone_attendee" ? "+905550000000" : undefined;
    return createBooking(db, {
      host: publicHost,
      eventType,
      start,
      durationMin: eventType.durationMinutes,
      booker: { name, email: `${name.toLowerCase().replace(/\W+/g, ".")}@example.com`, timeZone: TZ, locale: "en", phone },
      guests: [],
      location: { kind, value: phone ?? (kind === "in_person" ? "Main office" : null) },
      now: bookedAt,
    });
  }

  // Later today (the capture picks a zone where it is mid-morning) and tomorrow, in office hours.
  const { hour, minute } = localParts(now, TZ);
  const next = Math.ceil((hour * 60 + minute + 20) / 30) * 30; // the next half hour, 20+ min away
  await book("demo", at(0, 0, next), "Maya Chen", "jitsi");
  await book("intro", at(0, 0, next + 75), "Jonas Weber", "phone_attendee");
  await book("consultation", at(0, 0, next + 180), "Priya Nair", "jitsi");
  await book("demo", at(1, 10), "Lucas Moreau", "jitsi");
  await book("consultation", at(1, 13), "Selin Aydın", "jitsi");
  await book("intro", at(1, 15, 30), "Noah Kim", "phone_attendee");

  // History for the weekly numbers and the no-show tile.
  const past: [number, string, string][] = [
    [1, "Ella Park", "10"], [1, "Omar Haddad", "14"], [2, "Zoe Martin", "11"], [8, "Liam Brooks", "10"],
    [9, "Ana Costa", "15"], [12, "Ben Ito", "11"],
  ];
  for (const [daysAgo, name, hour] of past) {
    const start = at(-daysAgo, Number(hour));
    const created = await book("demo", start, name, "jitsi", start - HOUR);
    if (name === "Ben Ito") await db.update(attendee).set({ noShow: true }).where(eq(attendee.bookingId, created.booking.id));
  }

  // The schedule people actually see: Mon–Thu 9–17, Friday until 15:00, two overrides.
  const upcoming = (days: number) => formatDate(addDays(today, days));
  await updateSchedule(db, host.id, scheduleId, {
    name: "Working hours",
    timeZone: TZ,
    rules: [
      ...[1, 2, 3, 4].map((weekday) => ({ weekday, start: "09:00", end: "17:00" })),
      { weekday: 5, start: "09:00", end: "15:00" },
    ],
    overrides: [
      { date: upcoming(9), ranges: [] },
      { date: upcoming(16), ranges: [{ start: "10:00", end: "12:00" }] },
    ],
  });
  await createSchedule(db, host.id, {
    name: "Weekend support",
    timeZone: TZ,
    rules: [6, 0].map((weekday) => ({ weekday, start: "10:00", end: "14:00" })),
    overrides: [],
  });

  // A team with two (demo) teammates.
  await db.insert(user).values(TEAMMATES.map((t) => ({ ...t, emailVerified: true, timeZone: TZ })));
  const teamId = await createTeam(db, host.id, { name: "Northwind Studio", slug: teamSlug(username), logoUrl: null, brandColor: null });
  await db.insert(membership).values([
    { teamId, userId: TEAMMATES[0].id, role: "admin" },
    { teamId, userId: TEAMMATES[1].id, role: "member" },
  ]);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
