import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { listConnections } from "@/features/calendars/server/connections";
import { CopyButton } from "@/features/dashboard/components/copy-button";
import { EmptyBookings, SetupCard, type SetupStep } from "@/features/dashboard/components/setup-card";
import { AvailabilityCard, BookingPageCard, ConnectCalendarCard, EventTypesCard } from "@/features/dashboard/components/side-cards";
import { StatTiles } from "@/features/dashboard/components/stat-tiles";
import { UpcomingCard } from "@/features/dashboard/components/upcoming-card";
import { dayGroups, greeting, stepsLeftText, todaySummary } from "@/features/dashboard/overview";
import { loadDashboard } from "@/features/dashboard/server/overview";
import { listEventTypes } from "@/features/event-types/server/service";
import { getSchedule, listSchedules } from "@/features/schedules/server/service";
import { getProfile } from "@/features/settings/server/service";
import { getEnv } from "@/lib/env";
import { localDateOf } from "@/lib/availability/tz";
import { requireUser } from "@/lib/auth/session";
import { requestTime } from "@/lib/clock";
import { formatWeekdayDate } from "@/lib/format";

export const metadata: Metadata = { title: "Home" };

const headerButton = "h-10 rounded-md px-3.5 text-sm";

/** Dashboard home (ADM-005): the day ahead for a set-up host, a checklist before that. */
export default async function DashboardPage() {
  const user = await requireUser();
  const db = getDb();
  const now = requestTime();
  const profile = await getProfile(db, user.id);
  const timeZone = profile?.timeZone ?? "UTC";
  const weekStart = profile?.weekStart ?? 1;
  const prefs = { locale: profile?.locale ?? "en", timeZone, hour12: profile?.timeFormat === 12 };

  const [eventTypes, data, schedules, connections] = await Promise.all([
    listEventTypes(db, user.id),
    loadDashboard(db, user.id, { now, timeZone, weekStart }),
    listSchedules(db, user.id),
    listConnections(db, user.id),
  ]);
  const defaultSchedule = schedules.find((s) => s.isDefault) ?? schedules[0];
  const schedule = defaultSchedule ? await getSchedule(db, user.id, defaultSchedule.id) : null;

  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  const host = appUrl.replace(/^https?:\/\//, "");
  const username = profile?.username ?? null;
  const pageUrl = username ? `${appUrl}/${username}` : null;
  const publicTypes = eventTypes.filter((et) => et.enabled && !et.hidden).length;
  const firstName = (profile?.name ?? user.name).split(" ")[0];
  const groups = dayGroups(data.upcoming, now, timeZone);

  const steps: SetupStep[] = [
    { id: "email", done: Boolean(profile?.emailVerified), description: `We sent a link to ${profile?.email ?? user.email}.` },
    { id: "username", done: Boolean(username), description: `Your booking page lives at ${host}/your-name.` },
    { id: "timeZone", done: timeZone !== "UTC" },
    { id: "eventType", done: eventTypes.length > 0, description: "A meeting people can book, like a 30-minute intro call." },
  ];
  const stepsLeft = steps.filter((s) => !s.done).length;

  const bookingPage = (
    <BookingPageCard
      url={pageUrl}
      display={`${host}/${username ?? "your-name"}`}
      subtitle={
        eventTypes.length > 0
          ? `${publicTypes} public event type${publicTypes === 1 ? "" : "s"} · ${timeZone.replaceAll("_", " ")}`
          : "Live once you add an event type."
      }
      live={Boolean(pageUrl) && eventTypes.length > 0}
    />
  );
  const upcoming = groups.length > 0 ? <UpcomingCard groups={groups} prefs={prefs} now={now} /> : <EmptyBookings />;

  if (stepsLeft > 0)
    return (
      <div className="flex w-full max-w-[1104px] flex-col gap-5 md:gap-7">
        <header className="flex flex-col gap-1 md:gap-1.5">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-[28px] md:leading-9">Welcome, {firstName}</h1>
          <p className="text-sm text-muted-foreground">{stepsLeftText(stepsLeft)}</p>
        </header>
        <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SetupCard steps={steps} />
          <div className="flex flex-col gap-4">
            {bookingPage}
            {connections.length === 0 && <ConnectCalendarCard />}
          </div>
        </div>
        {upcoming}
      </div>
    );

  return (
    <div className="flex w-full max-w-[1104px] flex-col gap-5 md:gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1 md:gap-1.5">
          <p className="text-[13px] text-muted-foreground">{formatWeekdayDate(now, prefs)}</p>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] md:text-[28px] md:leading-9">
            {greeting(now, timeZone)}, {firstName}
          </h1>
          <p className="hidden text-sm text-muted-foreground md:block">{todaySummary(data.today, now)}</p>
        </div>
        <div className="hidden gap-2 md:flex">
          {pageUrl && (
            <CopyButton value={pageUrl} variant="outline" className={`${headerButton} bg-card`}>
              Copy booking link
            </CopyButton>
          )}
          <Button asChild className={headerButton}>
            <Link href="/event-types/new">
              <Plus aria-hidden />
              New event type
            </Link>
          </Button>
        </div>
      </header>
      <StatTiles today={data.today} data={data} />
      <div className="grid items-start gap-5 md:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {upcoming}
        <div className="flex flex-col gap-5 md:gap-4">
          {bookingPage}
          <EventTypesCard eventTypes={eventTypes} weekCounts={data.week.byEventType} />
          <AvailabilityCard schedule={schedule} weekStart={weekStart} today={localDateOf(now, timeZone)} prefs={prefs} />
        </div>
      </div>
    </div>
  );
}
