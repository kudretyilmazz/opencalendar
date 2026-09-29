import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { QuickDecision } from "@/features/dashboard/components/quick-decision";
import { locationSummary, meetingJoinUrl, relativeStart } from "@/features/dashboard/overview";
import { cn } from "@/lib/cn";
import { type FormatPrefs, formatTime } from "@/lib/format";
import { formatAnswer, guestsLabel, initials, sourceLabel } from "../host-list";
import type { BookingTab, HostBooking } from "../server/service";
import { DecisionForm } from "./decision-form";
import { HostBookingActions } from "./host-booking-actions";
import { NoShowControls } from "./no-show-controls";

const pill = "h-auto rounded-full px-2 py-0.5";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,100px)_minmax(0,1fr)] gap-x-4 md:grid-cols-[120px_minmax(0,1fr)]">
      {/* The hidden colon keeps "Company: ACME" readable as one phrase for screen readers. */}
      <dt className="text-muted-foreground">
        {label}
        <span className="sr-only">{": "}</span>
      </dt>
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </div>
  );
}

function statusLine(b: HostBooking): string | null {
  if (b.status === "rejected") return `Rejected${b.rejectionReason ? `: ${b.rejectionReason}` : ""}`;
  if (b.status === "cancelled")
    return `${b.rescheduled ? "Rescheduled" : `Cancelled by ${b.cancelledBy ?? "system"}`}${b.cancellationReason ? `: ${b.cancellationReason}` : ""}`;
  return null;
}

/**
 * One booking on the host's Bookings page (BKG-010): time, invitee, badges and the row's main
 * action, with answers, guests, notes and the remaining actions in an expandable details area.
 */
export function HostBookingRow({
  b,
  tab,
  prefs,
  now,
  isNext,
  defaultOpen,
}: {
  b: HostBooking;
  tab: BookingTab;
  prefs: FormatPrefs;
  now: number;
  isNext: boolean;
  defaultOpen: boolean;
}) {
  const startAt = b.startAt.getTime();
  const endAt = b.endAt.getTime();
  const primary = b.attendees.find((a) => !a.isGuest) ?? b.attendees[0];
  const others = b.attendees.filter((a) => !a.isGuest && a !== primary);
  const guests = b.attendees.filter((a) => a.isGuest);
  const name = primary?.name ?? "Invitee";
  const minutes = Math.round((endAt - startAt) / 60_000);
  const location = locationSummary(b.locationKind, b.locationValue);
  const joinUrl = isNext ? meetingJoinUrl(b.locationValue) : null;
  const locationUrl = meetingJoinUrl(b.locationValue);
  const pending = b.status === "pending";
  const decidable = pending && endAt > now && (tab === "upcoming" || tab === "unconfirmed");
  const status = statusLine(b);
  const source = sourceLabel(b.source, b.utm);
  const answers = Object.entries(b.responses);

  return (
    <Collapsible asChild defaultOpen={defaultOpen}>
      <li className="flex flex-col gap-3 border-t border-border px-4 py-3.5 first:border-t-0 data-[state=open]:bg-background md:grid md:grid-cols-[96px_minmax(0,1fr)_auto] md:items-center md:gap-x-4 md:gap-y-3.5 md:px-5 md:py-4">
        <div className="flex items-center gap-2 tabular-nums md:flex-col md:items-start md:gap-0 md:self-start md:pt-1">
          <span className="text-sm font-semibold">
            {formatTime(startAt, prefs)}
            <span className="md:hidden"> – {formatTime(endAt, prefs)}</span>
          </span>
          <span className="hidden text-xs text-muted-foreground md:block">– {formatTime(endAt, prefs)}</span>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center self-start rounded-full bg-muted text-xs font-semibold md:self-center"
          >
            {initials(name)}
          </span>
          <div className="flex min-w-0 flex-col gap-[3px]">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold">
                <span className="sr-only">{b.eventTitle} with </span>
                {name}
              </h3>
              {primary && <span className="min-w-0 truncate text-[13px] text-muted-foreground">{primary.email}</span>}
              {isNext && (
                <Badge variant="highlight" className={pill}>
                  {relativeStart(startAt, now)}
                </Badge>
              )}
              {pending && (
                <Badge variant={decidable ? "warning" : "muted"} className={pill}>
                  {decidable ? "Needs confirmation" : "Never confirmed"}
                </Badge>
              )}
              {b.recurringSeriesId && (
                <Badge variant="muted" className={pill}>
                  Recurring
                </Badge>
              )}
              {guests.length > 0 && (
                <Badge variant="outline" className={cn(pill, "text-muted-foreground")}>
                  {guestsLabel(guests.length)}
                </Badge>
              )}
              {b.syncFailed && (
                <Badge variant="danger" className={pill}>
                  Calendar sync failed
                </Badge>
              )}
            </div>
            <span className="text-[13px] text-muted-foreground">
              {b.eventTitle} · {location.label} · {minutes} min
            </span>
            {status && <p className="text-[13px] text-destructive">{status}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 md:justify-end md:self-start">
          {decidable && (
            <div className="flex-1 md:flex-none">
              <QuickDecision bookingId={b.id} label={`${b.eventTitle} with ${name}`} />
            </div>
          )}
          {joinUrl && (
            <Button asChild className="h-11 flex-1 rounded-md px-3.5 text-sm md:h-9 md:flex-none md:text-[13px]">
              <a href={joinUrl} target="_blank" rel="noreferrer">
                Join
              </a>
            </Button>
          )}
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label={`Details for ${name}`}
              className="ml-auto size-11 rounded-md text-muted-foreground md:ml-0 md:size-9 [&[data-state=open]>svg]:rotate-180"
            >
              <ChevronDown aria-hidden />
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="flex min-w-0 flex-col gap-3.5 md:col-start-2 md:col-end-3 md:ml-11">
          <dl className="flex flex-col gap-1.5 text-[13px]">
            {answers.map(([key, value]) => (
              <Detail key={key} label={b.questionLabels[key] ?? key}>
                {formatAnswer(value)}
              </Detail>
            ))}
            {others.length > 0 && (
              <Detail label="Attendees">{others.map((a) => `${a.name} (${a.email})`).join(", ")}</Detail>
            )}
            {guests.length > 0 && <Detail label="Guests">{guests.map((g) => g.email).join(", ")}</Detail>}
            {b.notes && <Detail label="Notes">“{b.notes}”</Detail>}
            {b.locationValue && (
              <Detail label="Location">
                {locationUrl ? (
                  <a
                    href={locationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-highlight-text hover:underline"
                  >
                    {b.locationValue}
                  </a>
                ) : (
                  b.locationValue
                )}
              </Detail>
            )}
            {source && <Detail label="Source">{source}</Detail>}
          </dl>
          {b.syncFailed && (
            <p className="text-[13px] text-destructive">
              Calendar sync failed for this booking.{" "}
              <Link href="/settings/calendars" className="underline">
                Check your calendars
              </Link>
              .
            </p>
          )}
          {tab === "upcoming" && b.status === "accepted" && primary && (
            <HostBookingActions bookingId={b.id} attendeeName={primary.name} />
          )}
          {decidable && (
            <div className="md:max-w-sm">
              {/* Declining with a message for the invitee; the row's buttons decide in one click. */}
              <DecisionForm bookingId={b.id} initial="reject" />
            </div>
          )}
          {tab === "past" && b.status === "accepted" && (
            <NoShowControls
              bookingId={b.id}
              host={{ noShow: b.hostNoShow }}
              attendees={b.attendees.map((a) => ({ id: a.id, label: a.isGuest ? a.email : a.name, noShow: a.noShow }))}
            />
          )}
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}
