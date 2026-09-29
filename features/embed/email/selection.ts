import { formatDate, localDateOf } from "@/lib/availability/tz";
import type { EmailEmbedDay } from "./email-html";

/**
 * Selection state of the email embed panel: slot starts as ISO strings (UTC instants), so a
 * selection survives changing the time zone or browsing to another week.
 */

/** Adds or removes `slot`; returns the same array when adding would exceed `limit`. */
export function toggleSlot(selected: readonly string[], slot: string, limit: number): readonly string[] {
  if (selected.includes(slot)) return selected.filter((s) => s !== slot);
  if (selected.length >= limit) return selected;
  return [...selected, slot].sort((a, b) => Date.parse(a) - Date.parse(b));
}

/** Local calendar day (yyyy-MM-dd) of an instant in `timeZone`. */
export const dayKey = (ms: number, timeZone: string): string => formatDate(localDateOf(ms, timeZone));

/** Groups slot starts by their local day in `timeZone`, days and slots in time order. */
export function groupByDay(slots: readonly string[], timeZone: string): EmailEmbedDay[] {
  const byDay = new Map<string, string[]>();
  const sorted = slots.filter((s) => Number.isFinite(Date.parse(s))).sort((a, b) => Date.parse(a) - Date.parse(b));
  for (const slot of sorted) {
    const key = dayKey(Date.parse(slot), timeZone);
    byDay.set(key, [...(byDay.get(key) ?? []), slot]);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, daySlots]) => ({ date, slots: daySlots }));
}
