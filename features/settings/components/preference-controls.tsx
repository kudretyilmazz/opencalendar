"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { zoneClock } from "../display";

const MINUTE_MS = 60_000;

/**
 * "GMT+3 · 21:30 now" for the chosen zone. Rendered only after mount (the server and the
 * browser would disagree on the current minute) and refreshed every minute.
 */
export function ZoneClock({ timeZone, hour12, className }: { timeZone: string; hour12: boolean; className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, MINUTE_MS);
    return () => window.clearInterval(timer);
  }, []);
  if (!now) return null;
  return <span className={className}>{zoneClock(timeZone, now, hour12)}</span>;
}

const segmentClass =
  "flex h-[34px] min-h-[34px] items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:bg-card data-[state=checked]:shadow-xs max-md:h-11";

type TimeFormatProps = {
  defaultValue: string;
  onValueChange: (value: string) => void;
  invalid?: boolean;
};

/** 12/24-hour segmented control (a radio group submitting `timeFormat`). */
export function TimeFormatField({ defaultValue, onValueChange, invalid }: TimeFormatProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id="timeFormat-label" className="text-[13px] font-medium">
        Time format
      </span>
      <RadioGroupPrimitive.Root
        // Keyed on the saved value: see SelectField in profile-form.tsx.
        key={defaultValue}
        name="timeFormat"
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        aria-labelledby="timeFormat-label"
        aria-invalid={invalid || undefined}
        className="grid grid-cols-2 gap-1 rounded-[10px] bg-muted p-[3px]"
      >
        <RadioGroupPrimitive.Item value="12" className={segmentClass}>
          12-hour <span className="text-muted-foreground">2:30 PM</span>
        </RadioGroupPrimitive.Item>
        <RadioGroupPrimitive.Item value="24" className={segmentClass}>
          24-hour <span className="text-muted-foreground">14:30</span>
        </RadioGroupPrimitive.Item>
      </RadioGroupPrimitive.Root>
    </div>
  );
}

// Theme previews show fixed light/dark surfaces whatever the current theme is, so they use the
// Tailwind palette rather than the theme tokens.
const bar = "h-1.5 rounded-[3px]";

function SystemPreview() {
  return (
    <span className="flex h-[76px] overflow-hidden rounded-md border border-border" aria-hidden>
      <span className="flex w-1/2 flex-col gap-1.5 bg-neutral-50 p-2.5">
        <span className={cn(bar, "w-3/5 bg-slate-900")} />
        <span className={cn(bar, "w-4/5 bg-slate-300")} />
      </span>
      <span className="flex w-1/2 flex-col gap-1.5 bg-slate-950 p-2.5">
        <span className={cn(bar, "w-3/5 bg-gray-200")} />
        <span className={cn(bar, "w-4/5 bg-slate-700")} />
      </span>
    </span>
  );
}

function PlainPreview({ dark }: { dark?: boolean }) {
  const line = dark ? "bg-slate-700" : "bg-slate-300";
  return (
    <span
      className={cn(
        "flex h-[76px] flex-col gap-1.5 rounded-md border p-2.5",
        dark ? "border-gray-800 bg-slate-950" : "border-border bg-neutral-50",
      )}
      aria-hidden
    >
      <span className={cn(bar, "w-2/5", dark ? "bg-gray-200" : "bg-slate-900")} />
      <span className={cn(bar, "w-[70%]", line)} />
      <span className={cn(bar, "w-[55%]", line)} />
    </span>
  );
}

const THEME_TILES = [
  { value: "system", label: "System", preview: <SystemPreview /> },
  { value: "light", label: "Light", preview: <PlainPreview /> },
  { value: "dark", label: "Dark", preview: <PlainPreview dark /> },
] as const;

/** System / Light / Dark tiles with mini previews (a radio group submitting `theme`). */
export function ThemeTiles({ defaultValue, onValueChange }: { defaultValue: string; onValueChange: () => void }) {
  return (
    <RadioGroupPrimitive.Root
      key={defaultValue}
      name="theme"
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      aria-label="Theme"
      className="grid grid-cols-3 gap-2 px-3 py-3 sm:gap-4 md:px-6 md:py-5"
    >
      {THEME_TILES.map((tile) => (
        <RadioGroupPrimitive.Item
          key={tile.value}
          value={tile.value}
          className="flex min-w-0 flex-col gap-2.5 rounded-[12px] border-2 border-transparent p-1.5 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:border-highlight sm:p-2.5"
        >
          {tile.preview}
          <span className="px-0.5">{tile.label}</span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
