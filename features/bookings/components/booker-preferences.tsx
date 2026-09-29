"use client";

import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidTimeZone } from "@/lib/availability/tz";

type Props = {
  lockTimeZone: string | null;
  tzInput: string;
  timeZones: string[];
  hour12: boolean;
  onTzInput: (value: string) => void;
  onTimeZone: (timeZone: string) => void;
  onHour12: (hour12: boolean) => void;
};

/** Time zone picker and 12h/24h toggle under the calendar (BKG-003, EVT-017). */
export function BookerPreferences(props: Props) {
  const { hour12 } = props;
  return (
    <div className="mt-6 flex flex-wrap items-end gap-3">
      {props.lockTimeZone ? (
        <p className="flex items-center gap-1 text-sm">
          <Globe className="size-4" aria-hidden /> Times in {props.lockTimeZone.replaceAll("_", " ")}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tz" className="gap-1">
            <Globe className="size-4" aria-hidden /> Time zone
          </Label>
          <Input
            id="tz"
            list="tz-options"
            value={props.tzInput}
            className="w-64"
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
  );
}
