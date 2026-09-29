"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { formatDate, type LocalDate, wallToUtc } from "@/lib/availability/tz";
import { cn } from "@/lib/cn";
import { type FormatPrefs, formatShortDate, formatTime } from "@/lib/format";
import type { WeekSlotsState } from "./use-week-slots";

type EmailSlotPickerProps = {
  days: readonly LocalDate[];
  canGoBack: boolean;
  onWeek: (delta: -1 | 1) => void;
  activeDay: string | null;
  onActiveDay: (day: string) => void;
  slotsByDay: ReadonlyMap<string, readonly string[]>;
  selected: readonly string[];
  limit: number;
  onToggle: (slot: string) => void;
  week: WeekSlotsState & { retry: () => void };
  prefs: FormatPrefs;
};

/** Calendar dates are formatted at noon UTC in UTC, so the weekday never shifts with the zone. */
const dayLabel = (day: LocalDate, prefs: FormatPrefs) => formatShortDate(wallToUtc(day, 12 * 60, "UTC"), { ...prefs, timeZone: "UTC" });

/** Week navigation, one button per day (with its free-slot count) and toggle chips for the day's slots. */
export function EmailSlotPicker(props: EmailSlotPickerProps) {
  const { days, canGoBack, onWeek, activeDay, onActiveDay, slotsByDay, selected, limit, onToggle, week, prefs } = props;
  const first = days[0];
  const last = days[days.length - 1];
  const loading = week.status === "loading" || week.status === "idle";
  const daySlots = activeDay ? (slotsByDay.get(activeDay) ?? []) : [];
  const full = selected.length >= limit;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium" aria-live="polite">
          {first && last ? `${dayLabel(first, prefs)} – ${dayLabel(last, prefs)}` : ""}
        </span>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="icon" className="rounded-md" aria-label="Previous week" disabled={!canGoBack} onClick={() => onWeek(-1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon" className="rounded-md" aria-label="Next week" onClick={() => onWeek(1)}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7" role="group" aria-label="Days">
        {days.map((day) => {
          const key = formatDate(day);
          const count = slotsByDay.get(key)?.length ?? 0;
          const active = key === activeDay;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              data-day={key}
              disabled={!loading && count === 0}
              onClick={() => onActiveDay(key)}
              className={cn(
                "flex flex-col items-center rounded-md border border-border px-1 py-1.5 text-xs outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              <span className="font-medium">{dayLabel(day, prefs)}</span>
              <span className={active ? "text-primary-foreground" : "text-muted-foreground"}>{loading ? "…" : `${count} free`}</span>
            </button>
          );
        })}
      </div>

      {week.status === "error" ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            {week.message}
            <Button type="button" variant="outline" size="sm" className="rounded-md" onClick={week.retry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : loading && daySlots.length === 0 ? (
        <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Loading available times">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-16" />
          ))}
        </div>
      ) : daySlots.length === 0 ? (
        <p className="text-sm text-muted-foreground">No free times this week. Try the next week.</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Available times">
          {daySlots.map((slot) => {
            const pressed = selected.includes(slot);
            return (
              <Toggle
                key={slot}
                variant="outline"
                data-slot-start={slot}
                pressed={pressed}
                disabled={!pressed && full}
                onPressedChange={() => onToggle(slot)}
                className="rounded-md tabular-nums data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {formatTime(Date.parse(slot), prefs)}
              </Toggle>
            );
          })}
        </div>
      )}
    </div>
  );
}
