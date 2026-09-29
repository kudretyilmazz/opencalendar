import { CalendarDays, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HEADER_BUTTON_CLASS, PageHeader, PAGE_CLASS } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { BookingFilters } from "@/features/bookings/components/booking-filters";
import { HostBookingRow } from "@/features/bookings/components/host-booking-row";
import { type BookingDay, groupByDay, listSummary, nextBookingId } from "@/features/bookings/host-list";
import {
  BOOKING_TABS,
  type BookingTab,
  countHostBookings,
  type HostBooking,
  listHostBookings,
} from "@/features/bookings/server/service";
import { listEventTypes } from "@/features/event-types/server/service";
import { addDays, localDateOf, parseDate, wallToUtc } from "@/lib/availability/tz";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { requestTime } from "@/lib/clock";
import { type FormatPrefs, formatDateLong, formatWeekdayDate, timeZoneLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Bookings" };

const NOTICES: Record<string, string> = {
  cancelled: "Booking cancelled. The invitee has been notified.",
  reschedule_requested: "We asked the invitee to pick a new time.",
};

/** Radix Select items need a non-empty value; this one submits "all event types". */
const ALL_EVENT_TYPES = "__all";

const TAB_LABELS: Record<BookingTab, string> = {
  upcoming: "Upcoming",
  unconfirmed: "Unconfirmed",
  past: "Past",
  cancelled: "Cancelled",
};

const RELATIVE_WORDS = { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday" } as const;

const countPill = "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold";

/** A `yyyy-MM-dd` query value, or undefined when missing or malformed. */
function isoParam(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    parseDate(value);
    return value;
  } catch {
    return undefined;
  }
}

const dayStart = (value: string | undefined, tz: string, endOfDay = false) =>
  value === undefined ? undefined : wallToUtc(endOfDay ? addDays(parseDate(value), 1) : parseDate(value), 0, tz);

function dayLabel(group: BookingDay<HostBooking>, prefs: FormatPrefs, now: number): string {
  const noon = wallToUtc(group.date, 12 * 60, prefs.timeZone);
  const sameYear = group.date.year === localDateOf(now, prefs.timeZone).year;
  const date = sameYear ? formatWeekdayDate(noon, prefs) : formatDateLong(noon, prefs);
  return group.relative ? `${RELATIVE_WORDS[group.relative]} · ${date}` : date;
}

/** Host bookings dashboard (BKG-010). */
export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const user = await requireUser();
  const params = await searchParams;
  const tab: BookingTab = BOOKING_TABS.includes(params.tab as BookingTab) ? (params.tab as BookingTab) : "upcoming";
  const tz = user.timeZone ?? "UTC";
  const prefs = { locale: user.locale ?? "en", timeZone: tz, hour12: user.timeFormat === 12 };
  const db = getDb();
  const now = requestTime();
  const eventTypeId =
    typeof params.eventType === "string" && params.eventType && params.eventType !== ALL_EVENT_TYPES
      ? params.eventType
      : undefined;
  const from = isoParam(params.from);
  const to = isoParam(params.to);
  const filter = { eventTypeId, from: dayStart(from, tz), to: dayStart(to, tz, true), now };
  const [bookings, counts, eventTypes] = await Promise.all([
    listHostBookings(db, user.id, { ...filter, tab }),
    countHostBookings(db, user.id, filter),
    listEventTypes(db, user.id),
  ]);
  const current = Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "notice",
    ),
  );
  const query = (next: Record<string, string>) => `/bookings?${new URLSearchParams({ ...current, ...next })}`;
  const groups = groupByDay(bookings, (b) => b.startAt.getTime(), now, tz);
  const nextId =
    tab === "upcoming"
      ? nextBookingId(
          bookings.map((b) => ({ ...b, startAt: b.startAt.getTime(), endAt: b.endAt.getTime() })),
          now,
        )
      : null;
  const tabCount: Partial<Record<BookingTab, { n: number; className: string }>> = {
    upcoming: { n: counts.upcoming, className: "bg-muted text-foreground" },
    unconfirmed: { n: counts.unconfirmed, className: "bg-warning text-warning-foreground" },
  };

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Bookings"
        description={`Times shown in ${timeZoneLabel(tz, now, prefs.locale)}.`}
        actions={
          <Button asChild variant="outline" className={cn(HEADER_BUTTON_CLASS, "bg-card")}>
            <Link href="/availability/troubleshoot">
              <CalendarDays aria-hidden />
              Troubleshoot availability
            </Link>
          </Button>
        }
      />
      {typeof params.notice === "string" && NOTICES[params.notice] && (
        <Alert variant="success">
          <AlertDescription>{NOTICES[params.notice]}</AlertDescription>
        </Alert>
      )}
      <nav
        aria-label="Booking status"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 md:mx-0 md:px-0"
      >
        {BOOKING_TABS.map((t) => {
          const count = tabCount[t];
          return (
            <Link
              key={t}
              href={query({ tab: t })}
              aria-current={t === tab ? "page" : undefined}
              className={cn(
                "-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm md:min-h-0",
                t === tab
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABELS[t]}
              {count && count.n > 0 && (
                <span className={cn(countPill, count.className)}>
                  {count.n}
                  <span className="sr-only">{t === "unconfirmed" ? " awaiting confirmation" : " bookings"}</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <BookingFilters
        key={`${eventTypeId ?? ""}|${from ?? ""}|${to ?? ""}`}
        values={{ tab, eventType: eventTypeId, from, to }}
        eventTypes={eventTypes.map((et) => ({ id: et.id, title: et.title }))}
        weekStartsOn={user.weekStart ?? undefined}
      >
        {listSummary(bookings.map((b) => ({ startAt: b.startAt.getTime(), endAt: b.endAt.getTime() })))}
      </BookingFilters>
      {tab === "upcoming" && counts.unconfirmed > 0 && (
        <Link
          href={query({ tab: "unconfirmed" })}
          className="flex items-center gap-3 rounded-[12px] bg-warning px-4 py-3.5 text-warning-foreground hover:opacity-90 md:px-[18px]"
        >
          <Clock className="size-[18px] shrink-0" aria-hidden />
          <span className="grow text-sm font-medium">
            {counts.unconfirmed === 1 ? "1 request is" : `${counts.unconfirmed} requests are`} waiting for your
            decision. Invitees hear back as soon as you answer.
          </span>
          <span className="shrink-0 text-sm font-semibold">
            Review<span aria-hidden> →</span>
          </span>
        </Link>
      )}
      {bookings.length === 0 ? (
        <Card className="gap-0 px-5 py-8 text-sm text-muted-foreground">
          No {TAB_LABELS[tab].toLowerCase()} bookings.
        </Card>
      ) : (
        <section
          aria-label={`${TAB_LABELS[tab]} bookings`}
          className="overflow-hidden rounded-[12px] border border-border bg-card"
        >
          {groups.map((group, i) => (
            <div key={`${group.date.year}-${group.date.month}-${group.date.day}-${i}`}>
              <h2
                className={cn(
                  "border-b border-border bg-background px-4 py-2 text-xs font-medium text-muted-foreground md:px-5",
                  i > 0 && "border-t",
                )}
              >
                {dayLabel(group, prefs, now)}
              </h2>
              <ul>
                {group.rows.map((b) => (
                  <HostBookingRow
                    key={b.id}
                    b={b}
                    tab={tab}
                    prefs={prefs}
                    now={now}
                    isNext={b.id === nextId}
                    defaultOpen={b.id === bookings[0].id}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
