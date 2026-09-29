import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Button, Card, Input, Select } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { DecisionForm } from "@/features/bookings/components/decision-form";
import { HostBookingActions } from "@/features/bookings/components/host-booking-actions";
import { NoShowControls } from "@/features/bookings/components/no-show-controls";
import { BOOKING_TABS, type BookingTab, listHostBookings } from "@/features/bookings/server/service";
import { listEventTypes } from "@/features/event-types/server/service";
import { addDays, parseDate, wallToUtc } from "@/lib/availability/tz";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { requestTime } from "@/lib/clock";
import { formatDateLong, formatTime } from "@/lib/format";

export const metadata: Metadata = { title: "Bookings" };

const NOTICES: Record<string, string> = {
  cancelled: "Booking cancelled. The invitee has been notified.",
  reschedule_requested: "We asked the invitee to pick a new time.",
};

const TAB_LABELS: Record<BookingTab, string> = {
  upcoming: "Upcoming",
  unconfirmed: "Unconfirmed",
  past: "Past",
  cancelled: "Cancelled",
};

function dateParam(value: unknown, tz: string, endOfDay = false): number | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const date = parseDate(value);
    return wallToUtc(endOfDay ? addDays(date, 1) : date, 0, tz);
  } catch {
    return undefined;
  }
}

/** Host bookings dashboard (BKG-010). */
export default async function BookingsPage({ searchParams }: PageProps<"/bookings">) {
  const user = await requireUser();
  const params = await searchParams;
  const tab: BookingTab = BOOKING_TABS.includes(params.tab as BookingTab) ? (params.tab as BookingTab) : "upcoming";
  const tz = user.timeZone ?? "UTC";
  const prefs = { locale: user.locale ?? "en", timeZone: tz, hour12: user.timeFormat === 12 };
  const db = getDb();
  const eventTypeId = typeof params.eventType === "string" && params.eventType ? params.eventType : undefined;
  const [bookings, eventTypes] = await Promise.all([
    listHostBookings(db, user.id, {
      tab,
      eventTypeId,
      from: dateParam(params.from, tz),
      to: dateParam(params.to, tz, true),
      now: requestTime(),
    }),
    listEventTypes(db, user.id),
  ]);
  const current = Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "notice"),
  );
  const query = (next: Record<string, string>) => `/bookings?${new URLSearchParams({ ...current, ...next })}`;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <p className="text-sm text-muted">Times shown in {tz.replaceAll("_", " ")}.</p>
      </div>
      {typeof params.notice === "string" && NOTICES[params.notice] && <Alert tone="success">{NOTICES[params.notice]}</Alert>}
      <nav aria-label="Booking status" className="flex gap-1 border-b border-border">
        {BOOKING_TABS.map((t) => (
          <Link
            key={t}
            href={query({ tab: t })}
            aria-current={t === tab ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", t === tab ? "border-foreground font-medium" : "border-transparent text-muted")}
          >
            {TAB_LABELS[t]}
          </Link>
        ))}
      </nav>
      <form className="flex flex-wrap items-end gap-3" action="/bookings">
        <input type="hidden" name="tab" value={tab} />
        <label className="flex flex-col gap-1 text-sm">
          Event type
          <Select name="eventType" defaultValue={eventTypeId ?? ""} className="w-56">
            <option value="">All event types</option>
            {eventTypes.map((et) => (
              <option key={et.id} value={et.id}>
                {et.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          From
          <Input type="date" name="from" defaultValue={typeof params.from === "string" ? params.from : ""} className="w-44" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To
          <Input type="date" name="to" defaultValue={typeof params.to === "string" ? params.to : ""} className="w-44" />
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {bookings.length === 0 ? (
        <Card className="text-sm text-muted">No {TAB_LABELS[tab].toLowerCase()} bookings.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {bookings.map((b) => {
            const primary = b.attendees.find((a) => !a.isGuest) ?? b.attendees[0];
            const guests = b.attendees.filter((a) => a.isGuest);
            return (
              <li key={b.id}>
                <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-col gap-1 text-sm">
                    <p className="font-medium">
                      {formatDateLong(b.startAt.getTime(), prefs)} · {formatTime(b.startAt.getTime(), prefs)} –{" "}
                      {formatTime(b.endAt.getTime(), prefs)}
                    </p>
                    <p>
                      {b.eventTitle} with {primary?.name} <span className="text-muted">({primary?.email})</span>
                    </p>
                    {guests.length > 0 && <p className="text-muted">Guests: {guests.map((g) => g.email).join(", ")}</p>}
                    {b.notes && <p className="text-muted">“{b.notes}”</p>}
                    {Object.entries(b.responses).length > 0 && (
                      <p className="text-muted">
                        {Object.entries(b.responses)
                          .map(([k, v]) => `${b.questionLabels[k] ?? k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : v}`)
                          .join(" · ")}
                      </p>
                    )}
                    {b.recurringSeriesId && <p className="text-muted">Part of a recurring series</p>}
                    {b.status === "rejected" && <p className="text-danger">Rejected{b.rejectionReason ? `: ${b.rejectionReason}` : ""}</p>}
                    {b.locationValue && <p className="break-all text-muted">Location: {b.locationValue}</p>}
                    {b.syncFailed && (
                      <p className="text-danger">
                        Calendar sync failed for this booking. <Link href="/settings/calendars" className="underline">Check your calendars</Link>.
                      </p>
                    )}
                    {b.status === "cancelled" && (
                      <p className="text-danger">
                        {b.rescheduled ? "Rescheduled" : `Cancelled by ${b.cancelledBy ?? "system"}`}
                        {b.cancellationReason ? `: ${b.cancellationReason}` : ""}
                      </p>
                    )}
                  </div>
                  {tab === "upcoming" && primary && <HostBookingActions bookingId={b.id} attendeeName={primary.name} />}
                  {tab === "unconfirmed" && (
                    <div className="sm:w-80">
                      <DecisionForm bookingId={b.id} />
                    </div>
                  )}
                  {tab === "past" && b.status === "accepted" && (
                    <NoShowControls
                      bookingId={b.id}
                      host={{ noShow: b.hostNoShow }}
                      attendees={b.attendees.map((a) => ({ id: a.id, label: a.isGuest ? a.email : a.name, noShow: a.noShow }))}
                    />
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
