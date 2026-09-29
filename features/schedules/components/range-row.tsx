"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimePicker } from "@/components/ui/time-picker";
import type { Range } from "../week";

/** 84×36 time buttons (44px tall on touch screens). */
const TIME_CLASS = "w-[84px] rounded-md bg-card data-[size=default]:h-11 md:data-[size=default]:h-9";
export const ICON_BUTTON_CLASS = "size-11 rounded-md text-muted-foreground md:size-9";

/** One "start – end" range with its remove button; `label` names the controls ("Monday range 1"). */
export function RangeRow(props: { range: Range; label: string; onChange: (r: Range) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <TimePicker
        aria-label={`${props.label} start`}
        value={props.range.start}
        onValueChange={(start) => props.onChange({ ...props.range, start })}
        className={TIME_CLASS}
      />
      <span aria-hidden className="text-muted-foreground">
        –
      </span>
      <TimePicker
        aria-label={`${props.label} end`}
        value={props.range.end}
        onValueChange={(end) => props.onChange({ ...props.range, end })}
        className={TIME_CLASS}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${props.label}`}
        onClick={props.onRemove}
        className={ICON_BUTTON_CLASS}
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}
