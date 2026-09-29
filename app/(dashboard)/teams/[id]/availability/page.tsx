import type { Metadata } from "next";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { cachedExternalBusyFor } from "@/features/calendars/server/runtime";
import { AvailabilityGrid } from "@/features/teams/components/availability-grid";
import { teamAvailability } from "@/features/teams/server/availability";
import { orNotFound } from "@/features/teams/server/load";
import { getTeam } from "@/features/teams/server/service";
import { requireUser } from "@/lib/auth/session";
import {
  addDays,
  formatDate,
  isValidTimeZone,
  localDateOf,
  parseDate,
  wallToUtc,
  weekdayOf,
} from "@/lib/availability/tz";
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
  const members = await teamAvailability(db, user.id, id, window, (userId) =>
    cachedExternalBusyFor({ id: userId, timeZone }, ""),
  );
  const link = (d: string, v: string) => `/teams/${id}/availability?view=${v}&date=${d}`;

  const segment = (v: "day" | "week", label: string) => (
    <Link
      aria-current={view === v ? "page" : undefined}
      href={link(formatDate(day), v)}
      className={
        view === v
          ? "flex h-11 items-center rounded-[6px] bg-card px-3.5 text-[13px] font-medium shadow-xs md:h-8"
          : "flex h-11 items-center rounded-[6px] px-3.5 text-[13px] font-medium text-muted-foreground hover:text-foreground md:h-8"
      }
    >
      {label}
    </Link>
  );

  return (
    <div className={PAGE_CLASS}>
      <div className="flex flex-col gap-3">
        <Link
          href={`/teams/${id}`}
          className="flex min-h-11 w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground md:min-h-0"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {team.name}
        </Link>
        <PageHeader
          title="Team availability"
          description={`Working hours and busy time for everyone in ${team.name}, in ${timeZone.replaceAll("_", " ")}.`}
        />
      </div>
      <nav aria-label="Period" className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-11 rounded-md bg-card px-3.5 text-[13px] md:h-9">
            <Link href={link(formatDate(addDays(first, -days)), view)}>
              <ChevronLeft aria-hidden />
              Previous
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-md bg-card px-3.5 text-[13px] md:h-9">
            <Link href={link(formatDate(addDays(first, days)), view)}>
              Next
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
        <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
          {segment("day", "Day")}
          {segment("week", "Week")}
        </div>
      </nav>
      <Card className="gap-0 px-4 py-4 md:px-5 md:py-[18px]">
        <AvailabilityGrid members={members} firstDay={first} days={days} timeZone={timeZone} />
      </Card>
    </div>
  );
}
