"use client";

import { format } from "date-fns";
import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { parseIsoDate, toIsoDate } from "@/lib/date-input";

type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DatePickerProps = {
  id?: string;
  /** Submits the value as `yyyy-MM-dd` through a hidden input, like `<input type="date">` did. */
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Inclusive bounds as `yyyy-MM-dd`. */
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Shows a clear button once a date is picked; leave off for fields that always need a date. */
  clearable?: boolean;
  weekStartsOn?: number;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/**
 * shadcn date picker (Popover + Calendar) that drops in where `<input type="date">` was: it
 * speaks the same `yyyy-MM-dd` strings and works both controlled and inside server-action forms.
 */
export function DatePicker({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  placeholder = "Pick a date",
  disabled,
  clearable,
  weekStartsOn,
  className,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = value ?? internal;
  const selected = parseIsoDate(current);
  const minDate = parseIsoDate(min);
  const maxDate = parseIsoDate(max);

  const commit = (next: string) => {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <div className={cn("relative flex w-full items-center", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            data-empty={!selected}
            className={cn("w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground", clearable && selected && "pr-8")}
            {...aria}
          >
            <CalendarIcon aria-hidden />
            {selected ? format(selected, "PPP") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? minDate}
            weekStartsOn={weekStartsOn as WeekDay | undefined}
            disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
            onSelect={(date) => {
              commit(date ? toIsoDate(date) : "");
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {clearable && selected && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute right-1.5"
          aria-label="Clear date"
          onClick={() => commit("")}
        >
          <XIcon aria-hidden />
        </Button>
      )}
      {name && <input type="hidden" name={name} value={current} />}
    </div>
  );
}
