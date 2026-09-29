import { format, isValid, parse } from "date-fns";

/** Values the date/time pickers exchange with forms: the same strings `<input type="date|time">` used. */
const ISO_DATE = "yyyy-MM-dd";

const pad = (n: number) => String(n).padStart(2, "0");

/** Parses a calendar date ("2026-09-29") as a local date, so it never shifts across time zones. */
export function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = parse(value, ISO_DATE, new Date());
  return isValid(date) ? date : undefined;
}

export function toIsoDate(date: Date): string {
  return format(date, ISO_DATE);
}

/** "HH:mm" slots for one day, `stepMinutes` apart. */
export function timeSlots(stepMinutes: number): string[] {
  return Array.from({ length: Math.floor((24 * 60) / stepMinutes) }, (_, i) => {
    const minutes = i * stepMinutes;
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  });
}

/** Keeps an off-grid saved value (e.g. 09:10) selectable instead of silently dropping it. */
export function withValue(slots: string[], value: string): string[] {
  return !value || slots.includes(value) ? slots : [...slots, value].toSorted();
}

/** "17:30" → "5:30 PM" when `hour12`; 24-hour values pass through. */
export function formatClock(value: string, hour12: boolean): string {
  if (!hour12) return value;
  const [h, m] = value.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}
