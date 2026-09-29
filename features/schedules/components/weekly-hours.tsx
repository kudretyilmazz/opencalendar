"use client";

import { Copy, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { copyDay as copyDayRules, dayOrder, nextRange, type Range, type Rule, WEEKDAY_NAMES } from "../week";
import { ICON_BUTTON_CLASS, RangeRow } from "./range-row";

/** "Copy Monday to other days": pick the days that get Monday's hours. */
function CopyDayButton({
  weekday,
  weekStart,
  onCopy,
}: {
  weekday: number;
  weekStart: number;
  onCopy: (targets: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<number[]>([]);
  const name = WEEKDAY_NAMES[weekday];
  const others = dayOrder(weekStart).filter((d) => d !== weekday);
  const toggle = (day: number, on: boolean) => setTargets((t) => (on ? [...t, day] : t.filter((d) => d !== day)));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTargets([]);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Copy ${name} to other days`}
          className={ICON_BUTTON_CLASS}
        >
          <Copy aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-3 p-4">
        <p className="text-sm font-medium" id={`copy-${weekday}-title`}>
          Copy {name}’s hours to
        </p>
        <ul className="flex flex-col gap-1" aria-labelledby={`copy-${weekday}-title`}>
          {others.map((day) => (
            <li key={day} className="flex min-h-9 items-center gap-2.5">
              <Checkbox
                id={`copy-${weekday}-${day}`}
                checked={targets.includes(day)}
                onCheckedChange={(v) => toggle(day, v === true)}
              />
              <Label htmlFor={`copy-${weekday}-${day}`} className="flex-1 font-normal">
                {WEEKDAY_NAMES[day]}
              </Label>
            </li>
          ))}
        </ul>
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" className="h-9 rounded-md px-3" onClick={() => setTargets(others)}>
            Select all
          </Button>
          <Button
            type="button"
            className="h-9 rounded-md px-3"
            disabled={targets.length === 0}
            onClick={() => {
              onCopy(targets);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DayRow(props: {
  weekday: number;
  weekStart: number;
  ranges: Range[];
  first: boolean;
  onChange: (ranges: Range[]) => void;
  onCopy: (targets: number[]) => void;
}) {
  const { weekday, ranges, onChange } = props;
  const name = WEEKDAY_NAMES[weekday];
  const on = ranges.length > 0;
  const next = nextRange(ranges);
  const switchId = `day-${weekday}`;

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-2.5 md:flex-nowrap md:px-6",
        !props.first && "border-t border-border",
      )}
    >
      <div className="flex min-h-11 flex-1 items-center gap-3 md:min-h-9 md:w-[150px] md:flex-none">
        <Switch
          id={switchId}
          checked={on}
          aria-label={`${name} available`}
          onCheckedChange={(v) => onChange(v ? [{ start: "09:00", end: "17:00" }] : [])}
        />
        <label htmlFor={switchId} className={cn("cursor-pointer text-sm font-medium", !on && "text-muted-foreground")}>
          {name}
        </label>
      </div>
      <div className="order-last flex w-full flex-col gap-2 md:order-none md:w-auto md:flex-1">
        {on ? (
          ranges.map((range, i) => (
            <RangeRow
              key={i}
              range={range}
              label={`${name} range ${i + 1}`}
              onChange={(r) => onChange(ranges.map((x, j) => (j === i ? r : x)))}
              onRemove={() => onChange(ranges.filter((_, j) => j !== i))}
            />
          ))
        ) : (
          <span className="hidden pt-2 text-sm text-muted-foreground md:block">Unavailable</span>
        )}
      </div>
      <div className="flex gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Add hours on ${name}`}
          disabled={!next}
          onClick={() => next && onChange([...ranges, next])}
          className={ICON_BUTTON_CLASS}
        >
          <Plus aria-hidden />
        </Button>
        <CopyDayButton weekday={weekday} weekStart={props.weekStart} onCopy={props.onCopy} />
      </div>
    </div>
  );
}

/** The seven day rows of the weekly hours card. */
export function WeeklyHours({
  rules,
  weekStart,
  onRulesChange,
}: {
  rules: Rule[];
  weekStart: number;
  onRulesChange: (update: (rules: Rule[]) => Rule[]) => void;
}) {
  const setDay = (weekday: number, ranges: Range[]) =>
    onRulesChange((all) =>
      [...all.filter((r) => r.weekday !== weekday), ...ranges.map((r) => ({ ...r, weekday }))].toSorted(
        (a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start),
      ),
    );
  return (
    <div>
      {dayOrder(weekStart).map((weekday, i) => (
        <DayRow
          key={weekday}
          weekday={weekday}
          weekStart={weekStart}
          first={i === 0}
          ranges={rules.filter((r) => r.weekday === weekday).map(({ start, end }) => ({ start, end }))}
          onChange={(ranges) => setDay(weekday, ranges)}
          onCopy={(targets) => onRulesChange((all) => copyDayRules(all, weekday, targets))}
        />
      ))}
    </div>
  );
}
