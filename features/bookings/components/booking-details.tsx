"use client";

import { Clock, MapPin, Repeat, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { type FormatPrefs, formatDateLong, formatDuration, formatTime } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import type { BookingFormConfig } from "./booking-form";

type Props = {
  title: string;
  hostName: string;
  description: string | null;
  durations: number[];
  duration: number;
  seated: boolean;
  hideDetails?: boolean;
  /** Stacked above the calendar (column layout) instead of beside it. */
  stacked: boolean;
  form: BookingFormConfig;
  prefs: FormatPrefs;
  /** False before hydration: only the static details render (no browser locale/zone yet). */
  ready: boolean;
  onDuration: (minutes: number) => void;
};

/** The event details column of the booking page (BKG-002). */
export function BookingDetails(props: Props) {
  const { form, prefs, duration, ready } = props;
  return (
    <aside
      className={cn(
        "flex flex-col gap-3 border-b border-border p-6",
        !props.stacked && "md:border-b-0 md:border-r",
        props.hideDetails && "sr-only",
      )}
    >
      <p className="text-sm text-muted-foreground">{props.hostName}</p>
      <h1 className="text-xl font-semibold">{props.title}</h1>
      {ready && form.reschedule && (
        <Alert>
          <AlertDescription>
            Rescheduling your booking from {formatDateLong(form.reschedule.previousStart, prefs)}, {formatTime(form.reschedule.previousStart, prefs)}.
          </AlertDescription>
        </Alert>
      )}
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="size-4" aria-hidden /> {formatDuration(duration, prefs.locale)}
      </p>
      {ready && form.recurring && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Repeat className="size-4" aria-hidden /> Can repeat {form.recurring.frequency === "weekly" ? "weekly" : "monthly"}, up to {form.recurring.maxCount} times
        </p>
      )}
      {ready && props.seated && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4" aria-hidden /> Group event
        </p>
      )}
      {ready &&
        form.locations.map((loc) => (
          <p key={loc.kind} className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden /> {loc.label}
          </p>
        ))}
      {props.description && <Markdown source={props.description} className="text-sm" />}
      {ready && props.durations.length > 1 && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Duration</legend>
          <div className="flex flex-wrap gap-2">
            {props.durations.map((d) => (
              <Button key={d} type="button" variant={d === duration ? "default" : "outline"} aria-pressed={d === duration} onClick={() => props.onDuration(d)}>
                {formatDuration(d, prefs.locale)}
              </Button>
            ))}
          </div>
        </fieldset>
      )}
    </aside>
  );
}
