/**
 * Availability engine types (docs/03-architecture/availability-engine.md).
 * All instants are UTC epoch milliseconds; intervals are half-open [start, end).
 */

export type Ms = number;

export interface Interval {
  readonly start: Ms;
  readonly end: Ms;
}

/** Normalized: sorted, non-overlapping, non-adjacent, no empty intervals. */
export type IntervalSet = readonly Interval[];

export type ExclusionReason =
  | "min_notice"
  | "beyond_horizon"
  | "outside_working_hours"
  | "date_override"
  | "ooo"
  | "booking_conflict"
  | "external_calendar_busy"
  | "buffer"
  | "slot_held"
  | "limit_reached"
  | "seats_full";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

/** Wall-clock rule in the schedule's time zone. "HH:mm"; end "00:00" means 24:00. */
export interface WeeklyRule {
  readonly weekday: Weekday;
  readonly start: string;
  readonly end: string;
}

export interface TimeRange {
  readonly start: string;
  readonly end: string;
}

/** Replaces the weekly rules for one local date. No ranges = unavailable all day. */
export interface DateOverride {
  readonly date: string; // YYYY-MM-DD in the schedule tz
  readonly ranges: readonly TimeRange[];
}

export interface ScheduleInput {
  readonly timeZone: string;
  readonly rules: readonly WeeklyRule[];
  readonly overrides: readonly DateOverride[];
}

export interface ExistingBooking {
  readonly uid: string;
  readonly start: Ms;
  readonly end: Ms;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
}

/** A booking of the event type being queried (limits and seats, EVT-010/012). */
export interface SameTypeBooking {
  readonly uid: string;
  readonly start: Ms;
  readonly end: Ms;
  /** Seated events: attendees already in this booking. */
  readonly seatsTaken?: number;
}

export type LimitPeriod = "day" | "week" | "month" | "year";
export type PeriodLimits = Readonly<Partial<Record<LimitPeriod, number>>>;

export interface HostInput {
  readonly userId: string;
  readonly schedule: ScheduleInput;
  readonly bookings: readonly ExistingBooking[];
  readonly ooo: readonly Interval[];
  /** Slot holds of other booker sessions. */
  readonly holds: readonly Interval[];
  /** Busy times from the host's conflict calendars (AVL-006); `ref` names the calendar. */
  readonly externalBusy?: readonly (Interval & { readonly ref?: string })[];
  /** Active bookings of this event type around the window, for limits and seats. */
  readonly sameTypeBookings?: readonly SameTypeBooking[];
}

export type Horizon =
  | { readonly type: "rolling_days"; readonly days: number }
  | { readonly type: "rolling_business_days"; readonly days: number }
  | { readonly type: "date_range"; readonly start: string; readonly end: string }
  | { readonly type: "unlimited" };

export interface EventTypeInput {
  readonly durationMin: number;
  /** Defaults to the selected duration. */
  readonly slotIntervalMin?: number;
  readonly bufferBeforeMin: number;
  readonly bufferAfterMin: number;
  readonly minNoticeMin: number;
  readonly horizon: Horizon;
  /** EVT-010: max bookings / booked minutes per local period. */
  readonly limits?: { readonly bookings?: PeriodLimits; readonly minutes?: PeriodLimits };
  /** EVT-012: attendees per slot. */
  readonly seats?: number;
}

export interface SlotQuery {
  readonly now: Ms;
  readonly window: Interval;
  /** Booking being moved; it does not count as busy (BKG-009). */
  readonly rescheduleUid?: string;
  /** Return excluded candidates with reasons (owner diagnostics only, AVL-005). */
  readonly explain?: boolean;
}

export interface Slot {
  readonly start: Ms;
  readonly end: Ms;
  /** Seated events only. */
  readonly seatsRemaining?: number;
}

export interface ExcludedSlot extends Slot {
  readonly reason: ExclusionReason;
  /** e.g. the conflicting booking uid. Never expose to anonymous bookers. */
  readonly ref?: string;
}

export interface SlotResult {
  readonly slots: readonly Slot[];
  readonly excluded?: readonly ExcludedSlot[];
}
