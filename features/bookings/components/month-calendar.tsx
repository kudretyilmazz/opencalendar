"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, type LocalDate, wallToUtc, weekdayOf } from "@/lib/availability/tz";
import { cn } from "@/lib/cn";
import { type FormatPrefs, formatDateLong } from "@/lib/format";
import { type Month, monthDays, type Slot } from "./booker-view";
import { SlotButton } from "./slot-button";

type Props = {
  month: Month;
  today: LocalDate;
  /** Week start for the grid, 0 = Sunday. */
  weekStart: number;
  prefs: FormatPrefs;
  byDate: Map<string, Slot[]>;
  selectedDate: string | null;
  busy: boolean;
  loading: boolean;
  loadError: string | null;
  empty: boolean;
  seated: boolean;
  /** Column layout: times below the calendar at every width. */
  stacked: boolean;
  nowMs: number;
  preferences: ReactNode;
  onChangeMonth: (delta: number) => void;
  onSelectDate: (key: string) => void;
  onChooseSlot: (slot: Slot) => void;
};

/**
 * Month grid plus the chosen day's times (BKG-002). E2E tests rely on this DOM: the "Choose a
 * date" section with aria-busy, the "Days" group, day buttons with aria-pressed and "no times
 * available", "Next month", and slot buttons named by their time.
 */
export function MonthCalendar(props: Props) {
  const { month, prefs, byDate, selectedDate, today } = props;
  const locale = prefs.locale;
  const days = monthDays(month);
  const leading = (weekdayOf(days[0]) - props.weekStart + 7) % 7;
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(Date.UTC(2026, 0, 4 + ((props.weekStart + i) % 7))),
  );
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(month.year, month.month - 1, 1));
  const canGoBack = month.year > today.year || (month.year === today.year && month.month > today.month);

  return (
    <div className={cn("grid gap-6", !props.stacked && "lg:grid-cols-[1fr_220px]")}>
      <section aria-label="Choose a date" aria-busy={props.busy}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium" aria-live="polite">
            {monthLabel}
          </h2>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label="Previous month" disabled={!canGoBack} onClick={() => props.onChangeMonth(-1)}>
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Next month" onClick={() => props.onChangeMonth(1)}>
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground" aria-hidden>
          {weekdayNames.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1" role="group" aria-label="Days">
          {Array.from({ length: leading }, (_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {days.map((d) => {
            const key = formatDate(d);
            const available = (byDate.get(key)?.length ?? 0) > 0;
            const selected = key === selectedDate;
            const label = formatDateLong(wallToUtc(d, 12 * 60, "UTC"), { ...prefs, timeZone: "UTC" });
            return (
              <Button
                key={key}
                type="button"
                variant={selected ? "default" : available ? "secondary" : "ghost"}
                disabled={!available}
                aria-pressed={selected}
                aria-label={`${label}${available ? "" : ", no times available"}`}
                onClick={() => props.onSelectDate(key)}
                // No transition: axe must never sample a day mid-fade from the dimmed loading state.
                className={cn(
                  "aspect-square h-auto w-full rounded-md text-sm transition-none",
                  available && "font-medium hover:bg-primary hover:text-primary-foreground",
                  !available && "text-muted-foreground",
                )}
              >
                {d.day}
              </Button>
            );
          })}
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
        {!props.loading && !props.loadError && props.empty && (
          <p className="mt-3 text-sm text-muted-foreground">No times available this month. Try the next month.</p>
        )}
        {props.preferences}
      </section>
      <section aria-label="Choose a time">
        {selectedDate ? (
          <>
            <h2 className="mb-3 text-sm font-medium">{formatDateLong(byDate.get(selectedDate)?.[0]?.start ?? props.nowMs, prefs)}</h2>
            <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {(byDate.get(selectedDate) ?? []).map((s) => (
                <li key={s.start}>
                  <SlotButton slot={s} prefs={prefs} seated={props.seated} className="w-full" onChoose={props.onChooseSlot} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select a date to see available times.</p>
        )}
      </section>
    </div>
  );
}
