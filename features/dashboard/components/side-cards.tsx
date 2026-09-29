import { Calendar, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { EventTypeView } from "@/features/event-types/server/service";
import type { ScheduleView } from "@/features/schedules/server/service";
import { type LocalDate, wallToUtc } from "@/lib/availability/tz";
import { cn } from "@/lib/cn";
import { type FormatPrefs, formatShortDate } from "@/lib/format";
import { hoursSummary, nextOverride, weekdayChips, workingDaysLabel } from "../overview";
import { CopyButton } from "./copy-button";

export const cardClass = "gap-0 rounded-[12px] border border-border py-0 ring-0";

function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-11 items-center text-[13px] font-medium text-highlight-text hover:underline md:min-h-0">
      {children}
    </Link>
  );
}

/** The host's public booking link, ready to copy or open. */
export function BookingPageCard({
  url,
  display,
  subtitle,
  live,
}: {
  url: string | null;
  display: string;
  subtitle: string;
  /** False until the page has something to book: the address shows dashed and muted. */
  live: boolean;
}) {
  return (
    <Card className={cn(cardClass, "gap-3 p-4 md:gap-3.5 md:px-5 md:py-[18px]")}>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Your booking page</h2>
        <p className="hidden text-[13px] text-muted-foreground md:block">{subtitle}</p>
      </div>
      {live && url ? (
        <>
          <div className="hidden h-10 items-center gap-2 rounded-md border border-border bg-background pr-1.5 pl-3 md:flex">
            <span className="flex-1 truncate font-mono text-[13px]">{display}</span>
            <CopyButton value={url} variant="ghost" size="icon-sm" aria-label="Copy link" className="size-[30px] rounded-md text-muted-foreground" />
            <Button asChild variant="ghost" size="icon-sm" className="size-[30px] rounded-md text-muted-foreground">
              <a href={url} target="_blank" rel="noreferrer" aria-label="Open booking page">
                <ExternalLink aria-hidden />
              </a>
            </Button>
          </div>
          <p className="truncate font-mono text-[13px] text-muted-foreground md:hidden">{display}</p>
          <div className="grid grid-cols-2 gap-2 md:hidden">
            <CopyButton value={url} variant="outline" className="h-11 rounded-md bg-transparent text-sm">
              Copy link
            </CopyButton>
            <Button asChild variant="outline" className="h-11 rounded-md bg-transparent text-sm">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
                Open
              </a>
            </Button>
          </div>
        </>
      ) : (
        <div className="flex h-10 items-center rounded-md border border-dashed border-border bg-background px-3">
          <span className="truncate font-mono text-[13px] text-muted-foreground">{display}</span>
        </div>
      )}
    </Card>
  );
}

/** Up to four event types with this week's bookings each. */
export function EventTypesCard({ eventTypes, weekCounts }: { eventTypes: EventTypeView[]; weekCounts: Record<string, number> }) {
  return (
    <Card className={cn(cardClass, "hidden md:flex")}>
      <div className="flex items-center justify-between px-5 pt-[18px] pb-2.5">
        <h2 className="text-base font-semibold">Event types</h2>
        <CardLink href="/event-types">Manage →</CardLink>
      </div>
      {eventTypes.length === 0 ? (
        <p className="px-5 pb-[18px] text-[13px] text-muted-foreground">
          No event types yet. <CardLink href="/event-types/new">Create one</CardLink>
        </p>
      ) : (
        <ul className="flex flex-col px-2 pb-2">
          {eventTypes.slice(0, 4).map((et) => {
            const off = !et.enabled || et.hidden;
            return (
              <li key={et.id}>
                <Link href={`/event-types/${et.id}`} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted/60">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("truncate text-sm font-medium", off && "text-muted-foreground")}>{et.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {et.durationMinutes} min · {et.requiresConfirmation ? "requires confirmation" : `/${et.slug}`}
                    </span>
                  </span>
                  {off ? (
                    <Badge variant="outline" className="h-auto rounded-full border-border px-2 py-0.5 font-normal text-muted-foreground">
                      {et.enabled ? "Hidden" : "Off"}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground tabular-nums">{weekCounts[et.id] ?? 0} this week</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const dateLabel = (date: LocalDate, prefs: FormatPrefs) => formatShortDate(wallToUtc(date, 12 * 60, prefs.timeZone), prefs);

/** The default schedule at a glance: working days, hours and the next date override. */
export function AvailabilityCard({ schedule, weekStart, today, prefs }: { schedule: ScheduleView | null; weekStart: number; today: LocalDate; prefs: FormatPrefs }) {
  const hours = schedule ? hoursSummary(schedule.rules) : null;
  const override = schedule ? nextOverride(schedule.overrides, today) : null;
  return (
    <Card className={cn(cardClass, "gap-3 p-4 md:gap-3.5 md:px-5 md:py-[18px]")}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Availability</h2>
        <CardLink href={schedule ? `/availability/${schedule.id}` : "/availability"}>
          Edit<span className="hidden md:inline">&nbsp;→</span>
        </CardLink>
      </div>
      {schedule ? (
        <>
          <ul className="hidden grid-cols-7 gap-1.5 md:grid" aria-label="Working days">
            {weekdayChips(schedule.rules, weekStart).map((d) => (
              <li
                key={d.weekday}
                aria-label={`${d.name}: ${d.on ? "working" : "off"}`}
                className={cn(
                  "flex h-8 items-center justify-center rounded-sm text-xs font-medium",
                  d.on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <span aria-hidden>{d.letter}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1.5 text-[13px]">
            <span className="hidden md:inline">{hours ? `Working hours · ${hours}` : "No working hours set"}</span>
            <span className="md:hidden">{hours ? `${workingDaysLabel(schedule.rules, weekStart)} · ${hours}` : "No working hours set"}</span>
            {override && (
              <span className="text-muted-foreground">
                Next override: {dateLabel(override.date, prefs)}, {override.unavailable ? "unavailable all day" : "custom hours"}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">No schedule yet.</p>
      )}
    </Card>
  );
}

/** Optional first-run nudge towards conflict checking. */
export function ConnectCalendarCard() {
  return (
    <Card className={cn(cardClass, "gap-3.5 px-5 py-[18px]")}>
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Calendar className="size-[18px]" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">Connect a calendar</h2>
          <span className="text-xs text-muted-foreground">Optional · CalDAV or ICS feed</span>
        </div>
      </div>
      <p className="text-[13px] leading-normal text-muted-foreground">Busy times in your calendar are blocked automatically, so nobody books over them.</p>
      <Button asChild variant="outline" className="h-10 rounded-md bg-transparent text-sm">
        <Link href="/settings/calendars">Connect calendar</Link>
      </Button>
    </Card>
  );
}
