"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { type FormatPrefs, formatTime } from "@/lib/format";
import type { Slot } from "./booker-view";

type Props = {
  slot: Slot;
  prefs: FormatPrefs;
  seated: boolean;
  compact?: boolean;
  className?: string;
  onChoose: (slot: Slot) => void;
};

/** One bookable time, named by its start time (E2E and screen readers rely on the name). */
export function SlotButton({ slot, prefs, seated, compact, className, onChoose }: Props) {
  const seats = seated && slot.seats !== undefined ? `${slot.seats} ${slot.seats === 1 ? "seat" : "seats"} left` : null;
  return (
    <Button type="button" variant="outline" size={compact ? "sm" : "default"} className={cn(compact && "h-auto flex-col gap-0 px-1 py-1.5", className)} onClick={() => onChoose(slot)}>
      {formatTime(slot.start, prefs)}
      {seats && <span className={cn("text-xs text-muted-foreground", !compact && "ml-2")}>{seats}</span>}
    </Button>
  );
}
