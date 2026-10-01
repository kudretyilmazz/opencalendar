"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { parseIsoDate, toIsoDate } from "@/lib/date-input";

/** Radix Select items need a non-empty value; this one means "all event types". */
const ALL_EVENT_TYPES = "__all";

type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type BookingFilterValues = { tab: string; eventType?: string; team?: string; from?: string; to?: string };

/** Radix Select needs a non-empty value; this one means "personal and team bookings". */
const ALL_BOOKINGS = "__all";
/** Matches PERSONAL_BOOKINGS in the bookings service. */
const PERSONAL = "personal";

const control = "h-11 rounded-md border-input bg-card px-3 text-sm font-normal md:h-10";

/** `/bookings?tab=…&eventType=…&from=yyyy-MM-dd&to=yyyy-MM-dd`, the same GET params the page reads. */
function bookingsUrl(values: BookingFilterValues): string {
  const params = new URLSearchParams({ tab: values.tab });
  if (values.eventType) params.set("eventType", values.eventType);
  if (values.team) params.set("team", values.team);
  if (values.from) params.set("from", values.from);
  if (values.to) params.set("to", values.to);
  return `/bookings?${params}`;
}

/** Date range in a compact trigger label: "Sep 29 – Oct 12" (dates are local calendar days). */
function rangeLabel(from?: string, to?: string): string | null {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start && !end) return null;
  if (start && end)
    return from === to ? format(start, "MMM d, yyyy") : `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  return start ? `From ${format(start, "MMM d, yyyy")}` : `Until ${format(end!, "MMM d, yyyy")}`;
}

/**
 * Event type and date range filters for the host's bookings (BKG-010). Every change navigates
 * to the filtered URL, so the list itself stays a server-rendered page.
 */
export function BookingFilters({
  values,
  eventTypes,
  teams = [],
  weekStartsOn,
  children,
}: {
  values: BookingFilterValues;
  eventTypes: { id: string; title: string }[];
  /** The host's teams; with none, the team filter is left out. */
  teams?: { id: string; name: string }[];
  weekStartsOn?: number;
  /** Right-aligned summary of the filtered list. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const go = (next: Partial<BookingFilterValues>) =>
    startTransition(() => router.push(bookingsUrl({ ...values, ...next })));
  const label = rangeLabel(values.from, values.to);
  const filtered = Boolean(values.eventType || values.team || values.from || values.to);

  const openChange = (next: boolean) => {
    if (next) setDraft({ from: parseIsoDate(values.from), to: parseIsoDate(values.to ?? values.from) });
    setOpen(next);
  };
  const apply = () => {
    setOpen(false);
    go({
      from: draft?.from ? toIsoDate(draft.from) : undefined,
      to: draft?.to ? toIsoDate(draft.to) : draft?.from ? toIsoDate(draft.from) : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center" aria-busy={pending || undefined}>
      <Select
        value={values.eventType ?? ALL_EVENT_TYPES}
        onValueChange={(v) => go({ eventType: v === ALL_EVENT_TYPES ? undefined : v })}
      >
        <SelectTrigger
          id="filter-event-type"
          aria-label="Event type"
          className={cn(control, "w-full data-[size=default]:h-11 md:w-[220px] md:data-[size=default]:h-10")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_EVENT_TYPES}>All event types</SelectItem>
          {eventTypes.map((et) => (
            <SelectItem key={et.id} value={et.id}>
              {et.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {teams.length > 0 && (
        <Select value={values.team ?? ALL_BOOKINGS} onValueChange={(v) => go({ team: v === ALL_BOOKINGS ? undefined : v })}>
          <SelectTrigger
            id="filter-team"
            aria-label="Team"
            className={cn(control, "w-full data-[size=default]:h-11 md:w-[200px] md:data-[size=default]:h-10")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_BOOKINGS}>Personal and team</SelectItem>
            <SelectItem value={PERSONAL}>Personal only</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Popover open={open} onOpenChange={openChange}>
        <PopoverTrigger asChild>
          <Button
            id="filter-dates"
            type="button"
            variant="outline"
            aria-label={`Date range: ${label ?? "any date"}`}
            className={cn(control, "w-full justify-start gap-2 md:w-[260px]", !label && "text-muted-foreground")}
          >
            <CalendarIcon className="text-muted-foreground" aria-hidden />
            <span className="truncate">{label ?? "Any date"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={draft}
            onSelect={setDraft}
            defaultMonth={draft?.from}
            numberOfMonths={2}
            weekStartsOn={weekStartsOn as WeekDay | undefined}
            autoFocus
          />
          <div className="flex justify-end gap-2 border-t border-border p-2">
            <Button type="button" variant="ghost" className="h-9 rounded-md px-3" onClick={() => setDraft(undefined)}>
              Reset
            </Button>
            <Button type="button" className="h-9 rounded-md px-3" onClick={apply}>
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {filtered && (
        <Button
          type="button"
          variant="ghost"
          className="h-11 self-start rounded-md px-3 text-sm text-muted-foreground md:h-10 md:self-auto"
          onClick={() => go({ eventType: undefined, from: undefined, to: undefined })}
        >
          Clear filters
        </Button>
      )}
      {children && <span className="text-[13px] text-muted-foreground md:ml-auto">{children}</span>}
    </div>
  );
}
