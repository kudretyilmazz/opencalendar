import { offsetMs } from "./tz";
import type { LimitPeriod, Ms, PeriodLimits, SameTypeBooking } from "./types";

/**
 * Booking limits (EVT-010): counts and booked minutes per local calendar period of the
 * schedule's time zone. Weeks start on Monday (ISO). Pure; built once per query.
 */

const PERIODS: readonly LimitPeriod[] = ["day", "week", "month", "year"];
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Stable key of the local period containing `ms`, e.g. "2026-10-05" (day/week), "2026-10", "2026". */
export function periodKey(ms: Ms, timeZone: string, period: LimitPeriod): string {
  const local = new Date(ms + offsetMs(timeZone, ms)); // read with UTC getters = local wall clock
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + 1;
  if (period === "year") return String(y);
  if (period === "month") return `${y}-${pad(m)}`;
  if (period === "day") return `${y}-${pad(m)}-${pad(local.getUTCDate())}`;
  const monday = new Date(Date.UTC(y, m - 1, local.getUTCDate()) - ((local.getUTCDay() + 6) % 7) * DAY_MS);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

export type LimitChecker = (slot: { start: Ms; end: Ms }) => boolean;

/** Returns a predicate "would booking this slot exceed a limit?", or null when there are none. */
export function limitChecker(
  limits: { bookings?: PeriodLimits; minutes?: PeriodLimits } | undefined,
  bookings: readonly SameTypeBooking[],
  timeZone: string,
): LimitChecker | null {
  const active = PERIODS.filter((p) => limits?.bookings?.[p] !== undefined || limits?.minutes?.[p] !== undefined);
  if (!active.length) return null;
  const counts = new Map<string, number>();
  const minutes = new Map<string, number>();
  for (const b of bookings) {
    for (const p of active) {
      const key = `${p}:${periodKey(b.start, timeZone, p)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      minutes.set(key, (minutes.get(key) ?? 0) + (b.end - b.start) / 60_000);
    }
  }
  return (slot) =>
    active.some((p) => {
      const key = `${p}:${periodKey(slot.start, timeZone, p)}`;
      const maxCount = limits?.bookings?.[p];
      const maxMinutes = limits?.minutes?.[p];
      if (maxCount !== undefined && (counts.get(key) ?? 0) >= maxCount) return true;
      return maxMinutes !== undefined && (minutes.get(key) ?? 0) + (slot.end - slot.start) / 60_000 > maxMinutes;
    });
}
