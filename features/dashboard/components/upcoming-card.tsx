import { MapPin, Phone, Video } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, localDateOf, wallToUtc } from "@/lib/availability/tz";
import { cn } from "@/lib/cn";
import { type FormatPrefs, formatShortDate, formatTime } from "@/lib/format";
import { type DayGroup, type LocationIcon, locationSummary, meetingJoinUrl, type OverviewBooking, relativeStart } from "../overview";
import { QuickDecision } from "./quick-decision";

const ICONS: Record<LocationIcon, typeof Video> = { video: Video, phone: Phone, pin: MapPin };

const rowButton = "rounded-md px-3.5";

function BookingRow({ b, prefs, nextId, now }: { b: OverviewBooking; prefs: FormatPrefs; nextId: string | null; now: number }) {
  const location = locationSummary(b.locationKind, b.locationValue);
  const Icon = ICONS[location.icon];
  const minutes = Math.round((b.endAt - b.startAt) / 60_000);
  const isNext = b.id === nextId;
  const joinUrl = isNext ? meetingJoinUrl(b.locationValue) : null;
  const who = b.attendeeName ?? "an invitee";
  const day = formatDate(localDateOf(b.startAt, prefs.timeZone));
  const badge =
    b.status === "pending" ? (
      <Badge className="h-auto rounded-full bg-warning px-2 py-0.5 text-warning-foreground">Needs confirmation</Badge>
    ) : isNext ? (
      <Badge className="h-auto rounded-full bg-highlight px-2 py-0.5 text-highlight-foreground">{relativeStart(b.startAt, now)}</Badge>
    ) : null;

  return (
    <li className="flex flex-col gap-2.5 border-t border-border px-4 py-3.5 first:border-t-0 md:grid md:grid-cols-[104px_minmax(0,1fr)_auto] md:items-center md:gap-4 md:px-5 md:py-4">
      <div className="flex items-center gap-2 tabular-nums md:flex-col md:items-start md:gap-0">
        <span className="text-sm font-semibold">
          {formatTime(b.startAt, prefs)}
          <span className="md:hidden"> – {formatTime(b.endAt, prefs)}</span>
        </span>
        <span className="hidden text-xs text-muted-foreground md:block">– {formatTime(b.endAt, prefs)}</span>
        {badge && <span className="md:hidden">{badge}</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 md:gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">
            {b.eventTitle}
            <span className="md:hidden"> · {who}</span>
          </span>
          <span className="hidden truncate text-sm text-muted-foreground md:inline">with {who}</span>
          {badge && <span className="hidden md:inline-flex">{badge}</span>}
        </div>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="hidden size-3.5 shrink-0 md:block" aria-hidden />
          <span className="truncate">
            {location.label} · {minutes} min
          </span>
        </span>
      </div>
      {b.status === "pending" ? (
        <QuickDecision bookingId={b.id} label={`${b.eventTitle} with ${who}`} />
      ) : joinUrl ? (
        <Button asChild className={cn(rowButton, "h-11 text-sm md:h-9 md:text-[13px]")}>
          <a href={joinUrl} target="_blank" rel="noreferrer">
            <span className="md:hidden">Join meeting</span>
            <span className="hidden md:inline">Join</span>
          </a>
        </Button>
      ) : (
        <Button asChild variant="outline" className={cn(rowButton, "hidden h-9 bg-transparent text-[13px] md:inline-flex")}>
          <Link href={`/bookings?from=${day}&to=${day}`} aria-label={`Details: ${b.eventTitle} with ${who}`}>
            Details
          </Link>
        </Button>
      )}
    </li>
  );
}

const DAY_WORD = { today: "Today", tomorrow: "Tomorrow" } as const;

/** Today's and tomorrow's bookings, grouped by day, with the next one's join button. */
export function UpcomingCard({ groups, prefs, now }: { groups: DayGroup[]; prefs: FormatPrefs; now: number }) {
  const today = groups.find((g) => g.day === "today");
  const nextId = today?.bookings.find((b) => b.status === "accepted" && b.endAt > now)?.id ?? null;
  return (
    <Card className="gap-0 rounded-[12px] border border-border py-0 ring-0">
      <div className="flex items-center justify-between px-4 py-3.5 md:px-5 md:py-[18px]">
        <h2 id="upcoming-title" className="text-base font-semibold">
          <span className="md:hidden">{groups[0] ? DAY_WORD[groups[0].day] : "Upcoming"}</span>
          <span className="hidden md:inline">Upcoming</span>
        </h2>
        <Link href="/bookings" className="flex min-h-11 items-center text-[13px] font-medium text-highlight-text hover:underline md:min-h-0">
          All bookings<span className="hidden md:inline">&nbsp;→</span>
        </Link>
      </div>
      {groups.map((group, i) => (
        <div key={group.day}>
          <p
            className={cn("border-y border-border bg-background px-4 py-2 text-xs font-medium text-muted-foreground md:px-5", i === 0 && "hidden md:block")}
          >
            {DAY_WORD[group.day]} · {formatShortDate(wallToUtc(group.date, 12 * 60, prefs.timeZone), prefs)}
          </p>
          <ul className={cn(i === 0 && "border-t border-border md:border-t-0")}>
            {group.bookings.map((b) => (
              <BookingRow key={b.id} b={b} prefs={prefs} nextId={nextId} now={now} />
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}
