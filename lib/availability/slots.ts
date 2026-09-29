import { IntervalIndex } from "./intervals";
import { type LimitChecker, limitChecker } from "./limits";
import { expandSchedule, localDaysCovering } from "./schedule";
import { addDays, type LocalDate, localDateOf, parseDate, wallToUtc, weekdayOf } from "./tz";
import type {
  EventTypeInput,
  ExcludedSlot,
  ExclusionReason,
  HostInput,
  Interval,
  Ms,
  Slot,
  SlotQuery,
  SlotResult,
} from "./types";

const MIN = 60_000;

/** Exclusive end of the booking horizon, in the schedule's time zone (EVT-005). */
export function horizonEnd(horizon: EventTypeInput["horizon"], now: Ms, timeZone: string): Ms {
  const today = localDateOf(now, timeZone);
  switch (horizon.type) {
    case "unlimited":
      return Number.POSITIVE_INFINITY;
    case "rolling_days":
      return wallToUtc(addDays(today, horizon.days), 0, timeZone);
    case "rolling_business_days": {
      let day: LocalDate = today;
      let counted = 0;
      for (; ; day = addDays(day, 1)) {
        const weekday = weekdayOf(day);
        if (weekday !== 0 && weekday !== 6) counted++;
        if (counted >= horizon.days) break;
      }
      return wallToUtc(addDays(day, 1), 0, timeZone);
    }
    case "date_range":
      return wallToUtc(addDays(parseDate(horizon.end), 1), 0, timeZone);
  }
}

function horizonStart(horizon: EventTypeInput["horizon"], timeZone: string): Ms {
  return horizon.type === "date_range" ? wallToUtc(parseDate(horizon.start), 0, timeZone) : Number.NEGATIVE_INFINITY;
}

type Ref = Interval & { ref?: string };

/** Per-query lookup structures: every overlap check is O(log n) (NFR-001). */
type Context = {
  readonly event: EventTypeInput;
  readonly earliest: Ms;
  readonly notBefore: Ms;
  readonly latest: Ms;
  readonly working: IntervalIndex<Interval>;
  readonly overrideDays: IntervalIndex<Interval>;
  readonly ooo: IntervalIndex<Interval>;
  readonly bookings: IntervalIndex<Ref>;
  readonly busy: IntervalIndex<Ref>;
  readonly external: IntervalIndex<Ref>;
  readonly holds: IntervalIndex<Interval>;
  readonly limit: LimitChecker | null;
  /** Seated events: bookings at a start time that still have free seats, and full ones. */
  readonly openSeats: ReadonlyMap<Ms, { uid: string; end: Ms; remaining: number }>;
  readonly fullSeats: ReadonlySet<string>;
};

function buildContext(event: EventTypeInput, host: HostInput, query: SlotQuery): Context {
  const tz = host.schedule.timeZone;
  const { working, overrideDays } = expandSchedule(host.schedule, query.window);
  const bookings = host.bookings.filter((b) => b.uid !== query.rescheduleUid);
  const sameType = (host.sameTypeBookings ?? []).filter((b) => b.uid !== query.rescheduleUid);
  const seats = event.seats;
  const openSeats = new Map<Ms, { uid: string; end: Ms; remaining: number }>();
  const fullSeats = new Set<string>();
  if (seats) {
    for (const b of sameType) {
      const remaining = seats - (b.seatsTaken ?? seats);
      if (remaining > 0) openSeats.set(b.start, { uid: b.uid, end: b.end, remaining });
      else fullSeats.add(b.uid);
    }
  }
  return {
    event,
    earliest: query.now + event.minNoticeMin * MIN,
    notBefore: horizonStart(event.horizon, tz),
    latest: horizonEnd(event.horizon, query.now, tz),
    working: new IntervalIndex(working),
    overrideDays: new IntervalIndex(overrideDays),
    ooo: new IntervalIndex(host.ooo),
    bookings: new IntervalIndex(bookings.map((b) => ({ start: b.start, end: b.end, ref: b.uid }))),
    // Existing bookings block their own buffers too (EVT-003).
    busy: new IntervalIndex(bookings.map((b) => ({ start: b.start - b.bufferBeforeMin * MIN, end: b.end + b.bufferAfterMin * MIN, ref: b.uid }))),
    external: new IntervalIndex(host.externalBusy ?? []),
    holds: new IntervalIndex(host.holds),
    limit: limitChecker(event.limits, sameType, tz),
    openSeats,
    fullSeats,
  };
}

/** The open seated booking this exact slot would join, if any (EVT-012). */
function joinableSeat(ctx: Context, slot: Slot) {
  const seat = ctx.openSeats.get(slot.start);
  return seat && seat.end === slot.end ? seat : undefined;
}

/** Why a candidate slot can't be booked, or null when it can. First matching rule wins. */
function exclusion(ctx: Context, slot: Slot): { reason: ExclusionReason; ref?: string } | null {
  if (slot.start < ctx.earliest) return { reason: "min_notice" };
  if (slot.start >= ctx.latest || slot.start < ctx.notBefore) return { reason: "beyond_horizon" };
  if (!ctx.working.covers(slot)) {
    if (ctx.ooo.firstOverlap(slot)) return { reason: "ooo" };
    if (ctx.overrideDays.firstOverlap(slot)) return { reason: "date_override" };
    return { reason: "outside_working_hours" };
  }
  if (ctx.ooo.firstOverlap(slot)) return { reason: "ooo" };
  const seat = joinableSeat(ctx, slot);
  // Joining an open seat adds no booking, so limits don't apply to it.
  if (!seat && ctx.limit?.(slot)) return { reason: "limit_reached" };
  const others = (item: Ref) => item.ref !== seat?.uid;
  const core = ctx.bookings.findOverlap(slot, others);
  if (core) {
    const full = core.start === slot.start && core.ref !== undefined && ctx.fullSeats.has(core.ref);
    return { reason: full ? "seats_full" : "booking_conflict", ref: core.ref };
  }
  const padded = {
    start: slot.start - ctx.event.bufferBeforeMin * MIN,
    end: slot.end + ctx.event.bufferAfterMin * MIN,
  };
  const external = ctx.external.firstOverlap(padded);
  if (external) return { reason: "external_calendar_busy", ref: external.ref };
  const buffer = ctx.busy.findOverlap(padded, others);
  if (buffer) return { reason: "buffer", ref: buffer.ref };
  // Seated slots take many bookers, so one visitor's hold must not hide them (EVT-012); the seat
  // count is re-checked under the host lock when booking.
  if (!ctx.event.seats && ctx.holds.firstOverlap(slot)) return { reason: "slot_held" };
  return null;
}

/** Candidate starts aligned to the step from local midnight in the schedule tz (so :00/:30). */
function candidates(ctx: Context, window: Interval, tz: string): Slot[] {
  const duration = ctx.event.durationMin * MIN;
  const step = (ctx.event.slotIntervalMin ?? ctx.event.durationMin) * MIN;
  const out: Slot[] = [];
  const seen = new Set<Ms>();
  for (const day of localDaysCovering(window, tz)) {
    const midnight = wallToUtc(day, 0, tz);
    const nextMidnight = wallToUtc(addDays(day, 1), 0, tz);
    for (let start = midnight; start < nextMidnight; start += step) {
      if (start < window.start || start >= window.end || seen.has(start)) continue;
      seen.add(start);
      out.push({ start, end: start + duration });
    }
  }
  return out.toSorted((a, b) => a.start - b.start);
}

function validate(event: EventTypeInput): void {
  const positive = [event.durationMin, event.slotIntervalMin ?? event.durationMin];
  if (positive.some((n) => !Number.isInteger(n) || n <= 0)) throw new Error("Duration and interval must be positive integers");
  if ([event.bufferBeforeMin, event.bufferAfterMin, event.minNoticeMin].some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error("Buffers and notice must be non-negative integers");
  }
  if (event.seats !== undefined && (!Number.isInteger(event.seats) || event.seats < 1)) throw new Error("Seats must be a positive integer");
}

/**
 * Bookable slots for one host and event type in `query.window` (AVL-003). Pure and
 * deterministic: identical inputs give identical outputs (NFR-005).
 */
export function computeSlots(event: EventTypeInput, host: HostInput, query: SlotQuery): SlotResult {
  validate(event);
  const ctx = buildContext(event, host, query);
  const slots: Slot[] = [];
  const excluded: ExcludedSlot[] = [];
  for (const slot of candidates(ctx, query.window, host.schedule.timeZone)) {
    const why = exclusion(ctx, slot);
    if (!why) slots.push(ctx.event.seats ? { ...slot, seatsRemaining: joinableSeat(ctx, slot)?.remaining ?? ctx.event.seats } : slot);
    else if (query.explain) excluded.push({ ...slot, ...why });
  }
  return query.explain ? { slots, excluded } : { slots };
}

/**
 * Re-validation at booking time (BKG-005): the exact slot must be one the engine would offer,
 * including alignment, so arbitrary start times can't be booked.
 */
export function isSlotAvailable(
  event: EventTypeInput,
  host: HostInput,
  slot: Slot,
  context: { now: Ms; rescheduleUid?: string },
): { ok: true } | { ok: false; reason: ExclusionReason | "not_offered" } {
  if (slot.end - slot.start !== event.durationMin * MIN) return { ok: false, reason: "not_offered" };
  const window = { start: slot.start - 36 * 60 * MIN, end: slot.start + 36 * 60 * MIN };
  const result = computeSlots(event, host, { now: context.now, window, rescheduleUid: context.rescheduleUid, explain: true });
  if (result.slots.some((s) => s.start === slot.start)) return { ok: true };
  const hit = result.excluded?.find((s) => s.start === slot.start);
  return { ok: false, reason: hit?.reason ?? "not_offered" };
}
