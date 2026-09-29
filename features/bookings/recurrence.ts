import { addDays, localParts, wallToUtc } from "@/lib/availability/tz";

/**
 * Occurrence starts of a recurring booking (EVT-013), keeping the local wall-clock time in the
 * host's schedule zone across DST changes. Monthly series keep the day of month, clamped to the
 * month's last day (Jan 31 → Feb 28 → Mar 31).
 */
export function occurrenceStarts(firstStart: number, count: number, frequency: "weekly" | "monthly", timeZone: string): number[] {
  const p = localParts(firstStart, timeZone);
  const minutes = p.hour * 60 + p.minute;
  const date = { year: p.year, month: p.month, day: p.day };
  return Array.from({ length: count }, (_, k) => {
    if (frequency === "weekly") return wallToUtc(addDays(date, 7 * k), minutes, timeZone);
    const monthIndex = date.month - 1 + k;
    const year = date.year + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return wallToUtc({ year, month, day: Math.min(date.day, lastDay) }, minutes, timeZone);
  });
}
