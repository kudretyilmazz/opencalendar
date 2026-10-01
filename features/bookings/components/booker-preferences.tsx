"use client";

import { Globe } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidTimeZone } from "@/lib/availability/tz";
import { cn } from "@/lib/cn";

type Props = {
  lockTimeZone: string | null;
  tzInput: string;
  timeZones: string[];
  hour12: boolean;
  onTzInput: (value: string) => void;
  onTimeZone: (timeZone: string) => void;
  onHour12: (hour12: boolean) => void;
};

/**
 * Time zone picker and 12h/24h toggle under the calendar (BKG-003, EVT-017). In a narrow panel
 * (phones, small embeds) they fold into one summary line that opens them, so the day's times
 * start higher on the screen; wide panels always show them.
 */
export function BookerPreferences(props: Props) {
  const { hour12 } = props;
  const [open, setOpen] = useState(false);
  const zone = (props.lockTimeZone ?? props.tzInput).replaceAll("_", " ");
  return (
    <div className="mt-3 @xl/panel:mt-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="booker-preferences"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 rounded-md text-left text-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none @xl/panel:hidden"
      >
        <Globe className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {zone} · {hour12 ? "12h" : "24h"}
        </span>
        <span className="shrink-0 font-medium text-foreground">{open ? "Done" : "Change"}</span>
      </button>
      <div id="booker-preferences" className={cn("flex-wrap items-end gap-3 @xl/panel:flex", open ? "mt-2 flex" : "hidden")}>
        {props.lockTimeZone ? (
          <p className="flex items-center gap-1 text-sm">
            <Globe className="size-4" aria-hidden /> Times in {props.lockTimeZone.replaceAll("_", " ")}
          </p>
        ) : (
          <div className="flex w-full flex-col gap-1.5 @xl/panel:w-auto">
            <Label htmlFor="tz" className="gap-1">
              <Globe className="size-4" aria-hidden /> Time zone
            </Label>
            <Input
              id="tz"
              list="tz-options"
              value={props.tzInput}
              className="w-full @xl/panel:w-64"
              onChange={(e) => {
                props.onTzInput(e.target.value);
                if (isValidTimeZone(e.target.value) && props.timeZones.includes(e.target.value)) props.onTimeZone(e.target.value);
              }}
            />
            <datalist id="tz-options">
              {props.timeZones.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </div>
        )}
        <div role="group" aria-label="Clock format" className="flex">
          <Button type="button" variant={hour12 ? "default" : "outline"} aria-pressed={hour12} className="rounded-r-none" onClick={() => props.onHour12(true)}>
            12h
          </Button>
          <Button type="button" variant={!hour12 ? "default" : "outline"} aria-pressed={!hour12} className="rounded-l-none" onClick={() => props.onHour12(false)}>
            24h
          </Button>
        </div>
      </div>
    </div>
  );
}
