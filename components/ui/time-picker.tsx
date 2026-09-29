"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { formatClock, timeSlots, withValue } from "@/lib/date-input";

export type TimePickerProps = {
  id?: string;
  name?: string;
  /** "HH:mm" (24-hour), the same format `<input type="time">` used. */
  value: string;
  onValueChange: (value: string) => void;
  stepMinutes?: number;
  hour12?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
};

/** shadcn Select over fixed time slots; replaces the browser's `<input type="time">`. */
export function TimePicker({ id, name, value, onValueChange, stepMinutes = 15, hour12 = false, disabled, className, ...aria }: TimePickerProps) {
  const options = withValue(timeSlots(stepMinutes), value);
  return (
    <Select name={name} value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className={cn("w-28 tabular-nums", className)} {...aria}>
        <SelectValue placeholder="--:--" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((slot) => (
          <SelectItem key={slot} value={slot} className="tabular-nums">
            {formatClock(slot, hour12)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
