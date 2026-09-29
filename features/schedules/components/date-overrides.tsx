"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import type { ScheduleForm } from "../schemas";
import { nextRange, overrideDay, type Range, upcomingOverrides } from "../week";
import { ICON_BUTTON_CLASS, RangeRow } from "./range-row";

type Override = ScheduleForm["overrides"][number];

function OverrideRow({ override, onChange }: { override: Override; onChange: (ranges: Range[] | null) => void }) {
  const { date, ranges } = override;
  const day = overrideDay(date);
  const offId = `override-off-${date}`;
  const next = nextRange(ranges);
  return (
    <li className="flex flex-col gap-2 px-5 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-10 shrink-0 flex-col items-center justify-center rounded-md border border-border leading-[1.1]">
          <span className="text-[10px] font-semibold uppercase">{day.month}</span>
          <span className="text-[15px] font-semibold">{day.day}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{day.weekday}</span>
          <div className="flex items-center gap-2">
            <Checkbox
              id={offId}
              checked={ranges.length === 0}
              onCheckedChange={(v) => onChange(v === true ? [] : [{ start: "09:00", end: "17:00" }])}
            />
            <Label htmlFor={offId} className="text-xs font-normal text-muted-foreground">
              Unavailable all day
            </Label>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove override for ${day.label}`}
          onClick={() => onChange(null)}
          className={ICON_BUTTON_CLASS}
        >
          <X aria-hidden />
        </Button>
      </div>
      {ranges.length > 0 && (
        <div className="flex flex-col gap-2 md:pl-[52px]">
          {ranges.map((range, i) => (
            <RangeRow
              key={i}
              range={range}
              label={`${date} range ${i + 1}`}
              onChange={(r) => onChange(ranges.map((x, j) => (j === i ? r : x)))}
              onRemove={() => onChange(ranges.filter((_, j) => j !== i))}
            />
          ))}
          {next && (
            <Button
              type="button"
              variant="ghost"
              className="h-9 self-start rounded-md px-2 text-[13px] text-muted-foreground"
              onClick={() => onChange([...ranges, next])}
            >
              <Plus aria-hidden />
              Add hours
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/** Date overrides card: existing overrides (editable in place) and a date picker to add one. */
export function DateOverrides({
  overrides,
  today,
  weekStart,
  onOverrideChange,
}: {
  overrides: Override[];
  /** "yyyy-MM-dd" in the host's time zone, for the "N upcoming" count. */
  today: string;
  weekStart: number;
  onOverrideChange: (date: string, ranges: Range[] | null) => void;
}) {
  const [newDate, setNewDate] = useState("");
  const upcoming = upcomingOverrides(overrides, today);
  const taken = overrides.some((o) => o.date === newDate);

  return (
    <Card role="region" aria-labelledby="date-overrides" className="gap-0 py-0">
      <div className="flex items-center justify-between gap-3 px-5 pt-[18px] pb-2.5">
        <h2 id="date-overrides" className="text-base font-semibold">
          Date overrides
        </h2>
        <span className="text-xs text-muted-foreground">{upcoming > 0 ? `${upcoming} upcoming` : "None upcoming"}</span>
      </div>
      {overrides.length === 0 ? (
        <p className="px-5 py-2.5 text-[13px] text-muted-foreground">
          Change your hours for specific dates, or mark a date as unavailable.
        </p>
      ) : (
        <ul className="flex flex-col">
          {overrides.map((o) => (
            <OverrideRow key={o.date} override={o} onChange={(ranges) => onOverrideChange(o.date, ranges)} />
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 px-5 pt-2.5 pb-[18px]">
        <div className="flex gap-2">
          <DatePicker
            id="newOverride"
            aria-label="Add an override for"
            placeholder="Add an override"
            value={newDate}
            onValueChange={setNewDate}
            weekStartsOn={weekStart}
            className="flex-1 [&>button]:h-11 [&>button]:justify-center [&>button]:rounded-md [&>button]:bg-card [&>button]:font-medium [&>button]:text-foreground [&>button]:data-[empty=true]:text-foreground md:[&>button]:h-10"
          />
          {newDate && (
            <Button
              type="button"
              className="h-11 rounded-md px-3.5 md:h-10"
              disabled={taken}
              onClick={() => {
                onOverrideChange(newDate, [{ start: "09:00", end: "17:00" }]);
                setNewDate("");
              }}
            >
              Add override
            </Button>
          )}
        </div>
        {taken && <p className="text-xs text-muted-foreground">That date already has an override.</p>}
      </div>
    </Card>
  );
}
