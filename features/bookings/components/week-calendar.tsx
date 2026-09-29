"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { compareDates, formatDate, type LocalDate, wallToUtc } from "@/lib/availability/tz";
import { cn } from "@/lib/cn";
import { type FormatPrefs, formatDateLong } from "@/lib/format";
import { type Slot, weekDays } from "./booker-view";
import { SlotButton } from "./slot-button";

type Props = {
  /** First day of the visible week. */
  week: LocalDate;
  /** First day of the current week: the earliest week the booker can go back to. */
  firstWeek: LocalDate;
  prefs: FormatPrefs;
  byDate: Map<string, Slot[]>;
  selectedDate: string | null;
  busy: boolean;
  loading: boolean;
  loadError: string | null;
  seated: boolean;
  preferences: ReactNode;
  onChangeWeek: (delta: number) => void;
  onChooseSlot: (slot: Slot) => void;
};

const noon = (d: LocalDate) => wallToUtc(d, 12 * 60, "UTC");

/**
 * Week layout (`layout=week`): seven day columns in the booker's time zone, each listing its free
 * times. Choosing a time behaves exactly like the month layout.
 */
export function WeekCalendar(props: Props) {
  const { prefs, byDate, week } = props;
  const utc = { ...prefs, timeZone: "UTC" };
  const days = weekDays(week);
  const rangeLabel = new Intl.DateTimeFormat(prefs.locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).formatRange(noon(days[0]), noon(days[6]));
  const dayName = new Intl.DateTimeFormat(prefs.locale, { weekday: "short", timeZone: "UTC" });
  const canGoBack = compareDates(week, props.firstWeek) > 0;
  const empty = days.every((d) => !byDate.get(formatDate(d))?.length);

  return (
    <section aria-label="Choose a date and time" aria-busy={props.busy} data-layout="week">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-medium" aria-live="polite">
          {rangeLabel}
        </h2>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Previous week" disabled={!canGoBack} onClick={() => props.onChangeWeek(-1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Next week" onClick={() => props.onChangeWeek(1)}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-7 gap-2" role="group" aria-label="Week">
          {days.map((d) => {
            const key = formatDate(d);
            const slots = byDate.get(key) ?? [];
            const label = formatDateLong(noon(d), utc);
            return (
              <div key={key} className="flex min-w-0 flex-col gap-2">
                <h3
                  className={cn(
                    "flex flex-col items-center rounded-md py-1 text-xs text-muted-foreground",
                    key === props.selectedDate && "bg-muted text-foreground",
                  )}
                >
                  <span aria-hidden>{dayName.format(noon(d))}</span>
                  <span aria-hidden className={cn("text-base font-medium", slots.length > 0 && "text-foreground")}>
                    {d.day}
                  </span>
                  <span className="sr-only">{label}</span>
                </h3>
                {slots.length > 0 ? (
                  <ul aria-label={label} className="flex max-h-96 flex-col gap-1.5 overflow-y-auto">
                    {slots.map((s) => (
                      <li key={s.start}>
                        <SlotButton slot={s} prefs={prefs} seated={props.seated} compact className="w-full" onChoose={props.onChooseSlot} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-center text-sm text-muted-foreground">
                    <span aria-hidden>—</span>
                    <span className="sr-only">No times available</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {props.loading && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Spinner /> Loading…
        </p>
      )}
      {props.loadError && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{props.loadError}</AlertDescription>
        </Alert>
      )}
      {!props.loading && !props.loadError && empty && <p className="mt-3 text-sm text-muted-foreground">No times available this week. Try the next week.</p>}
      {props.preferences}
    </section>
  );
}
