import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { cachedExternalBusyFor } from "@/features/calendars/server/runtime";
import { AvailabilityGrid } from "@/features/teams/components/availability-grid";
import { teamAvailability } from "@/features/teams/server/availability";
import { orNotFound } from "@/features/teams/server/load";
import { getTeam } from "@/features/teams/server/service";
import { requireUser } from "@/lib/auth/session";
import { addDays, formatDate, isValidTimeZone, localDateOf, parseDate, wallToUtc, weekdayOf } from "@/lib/availability/tz";
import { requestTime } from "@/lib/clock";

export const metadata: Metadata = { title: "Team availability" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** TEAM-010: members' working hours and busy blocks for a day or a week, in the viewer's zone. */
export default async function TeamAvailabilityPage({ params, searchParams }: PageProps<"/teams/[id]/availability">) {
  const { id } = await params;
  const query = await searchParams;
  const user = await requireUser();
  const db = getDb();
  const team = await orNotFound(getTeam(db, user.id, id));
  const timeZone = user.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : "UTC";
  const view = one(query.view) === "day" ? "day" : "week";
  const requested = one(query.date);
  let day = localDateOf(requestTime(), timeZone);
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    try {
      day = parseDate(requested);
    } catch {
      // keep today
    }
  }
  const first = view === "week" ? addDays(day, -((weekdayOf(day) + 6) % 7)) : day; // weeks start on Monday
  const days = view === "week" ? 7 : 1;
  const window = { start: wallToUtc(first, 0, timeZone), end: wallToUtc(addDays(first, days), 0, timeZone) };
  const members = await teamAvailability(db, user.id, id, window, (userId) => cachedExternalBusyFor({ id: userId, timeZone }, ""));
  const link = (d: string, v: string) => `/teams/${id}/availability?view=${v}&date=${d}`;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <Link href={`/teams/${id}`} className="text-sm text-muted underline-offset-4 hover:underline">
          ← {team.name}
        </Link>
        <h1 className="text-2xl font-semibold">Team availability</h1>
      </div>
      <nav aria-label="Period" className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-accent" href={link(formatDate(addDays(first, -days)), view)}>
          ← Previous
        </Link>
        <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-accent" href={link(formatDate(addDays(first, days)), view)}>
          Next →
        </Link>
        <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-accent" aria-current={view === "day" ? "page" : undefined} href={link(formatDate(day), "day")}>
          Day
        </Link>
        <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-accent" aria-current={view === "week" ? "page" : undefined} href={link(formatDate(day), "week")}>
          Week
        </Link>
      </nav>
      <Card>
        <AvailabilityGrid members={members} firstDay={first} days={days} timeZone={timeZone} />
      </Card>
    </div>
  );
}
