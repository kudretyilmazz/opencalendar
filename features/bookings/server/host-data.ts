import { and, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { TtlCache } from "@/lib/ttl-cache";
import type { DbOrTx } from "@/db/client";
import { booking, bookingHost, slotReservation } from "@/db/schema";
import type { EventTypeInput, HostInput, Interval, SameTypeBooking, ScheduleInput } from "@/lib/availability/types";

const DAY = 86_400_000;
const PERIOD_DAYS = { day: 1, week: 7, month: 31, year: 366 } as const;

/** How far around the window bookings of the same event type matter (limits, EVT-010). */
function sameTypeSpanDays(event: Pick<EventTypeInput, "limits" | "seats">): number | null {
  const limited = (["year", "month", "week", "day"] as const).find(
    (p) => event.limits?.bookings?.[p] !== undefined || event.limits?.minutes?.[p] !== undefined,
  );
  if (limited) return PERIOD_DAYS[limited];
  return event.seats ? 1 : null;
}

/** Active bookings of one event type near the window, with seat counts (EVT-010/012). */
async function loadSameType(
  db: DbOrTx,
  eventTypeId: string,
  window: Interval,
  spanDays: number,
): Promise<SameTypeBooking[]> {
  const rows = await db
    .select({
      uid: booking.uid,
      start: booking.startAt,
      end: booking.endAt,
      // Qualified on purpose: an unqualified "id" would resolve to the attendee's own id.
      seats: sql<number>`(SELECT count(*)::int FROM attendee a WHERE a.booking_id = "booking"."id" AND NOT a.is_guest)`,
    })
    .from(booking)
    .where(
      and(
        eq(booking.eventTypeId, eventTypeId),
        inArray(booking.status, ["accepted", "pending", "awaiting_payment"]),
        gte(booking.startAt, new Date(window.start - spanDays * DAY)),
        lt(booking.startAt, new Date(window.end + spanDays * DAY)),
      ),
    );
  return rows.map((r) => ({ uid: r.uid, start: r.start.getTime(), end: r.end.getTime(), seatsTaken: r.seats }));
}

type HostDataInput = {
  hostId: string;
  schedule: ScheduleInput;
  window: Interval;
  now: number;
  ownHoldHash?: string;
  /** The event type being booked, when it has limits or seats. */
  eventType?: { id: string } & Pick<EventTypeInput, "limits" | "seats">;
};

type HostData = { base: Omit<HostInput, "holds">; holds: { start: number; end: number; hash: string }[] };

async function loadHostData(db: DbOrTx, input: Omit<HostDataInput, "ownHoldHash">): Promise<HostData> {
  const from = new Date(input.window.start - DAY);
  const to = new Date(input.window.end + DAY);
  const span = input.eventType ? sameTypeSpanDays(input.eventType) : null;
  const [bookings, holds, sameType] = await Promise.all([
    db
      .select({
        uid: booking.uid,
        start: booking.startAt,
        end: booking.endAt,
        bufferBefore: booking.bufferBeforeMinutes,
        bufferAfter: booking.bufferAfterMinutes,
      })
      .from(bookingHost)
      .innerJoin(booking, eq(booking.id, bookingHost.bookingId))
      .where(
        and(
          eq(bookingHost.userId, input.hostId),
          eq(bookingHost.active, true),
          sql`${bookingHost.blockedStart} < ${to} AND ${bookingHost.blockedEnd} > ${from}`,
        ),
      ),
    db
      .select({ start: slotReservation.startAt, end: slotReservation.endAt, hash: slotReservation.sessionTokenHash })
      .from(slotReservation)
      .where(and(eq(slotReservation.userId, input.hostId), gt(slotReservation.expiresAt, new Date(input.now)))),
    span !== null && input.eventType
      ? loadSameType(db, input.eventType.id, input.window, span)
      : Promise.resolve(undefined),
  ]);
  return {
    base: {
      userId: input.hostId,
      schedule: input.schedule,
      ooo: [],
      bookings: bookings.map((b) => ({
        uid: b.uid,
        start: b.start.getTime(),
        end: b.end.getTime(),
        bufferBeforeMin: b.bufferBefore,
        bufferAfterMin: b.bufferAfter,
      })),
      ...(sameType && { sameTypeBookings: sameType }),
    },
    holds: holds.map((h) => ({ start: h.start.getTime(), end: h.end.getTime(), hash: h.hash })),
  };
}

/** A booker never blocks themselves: holds owned by `ownHoldHash` are ignored. */
function withHolds(data: HostData, ownHoldHash: string | undefined): HostInput {
  return { ...data.base, holds: data.holds.filter((h) => h.hash !== ownHoldHash).map(({ start, end }) => ({ start, end })) };
}

/**
 * Loads everything the engine needs about one host for `window` (padded by a day so buffers
 * and time zones at the edges are covered). Holds owned by `ownHoldHash` are ignored so a
 * booker never blocks themselves.
 */
export async function loadHostInput(db: DbOrTx, input: HostDataInput): Promise<HostInput> {
  return withHolds(await loadHostData(db, input), input.ownHoldHash);
}

/**
 * Display-only variant for the public slot endpoint (NFR-001): the host's bookings and holds are
 * shared across requests for one second, so a burst of visitors costs one set of queries. The
 * visitor's own hold is still excluded per request. Booking and holding never use this — they
 * re-read everything inside the transaction.
 */
const DISPLAY_TTL_MS = 1_000;
const displayCache = new TtlCache<HostData>(DISPLAY_TTL_MS, 5_000);

/**
 * Called after every booking change in this process (book, hold, cancel, decide, seats), so the
 * page a visitor loads next shows it at once; other replicas catch up within DISPLAY_TTL_MS.
 */
export function invalidateHostDisplayCache(): void {
  displayCache.clear();
}

/** Resolves `write` and then refreshes the display cache (use for every booking mutation). */
export async function refreshDisplay<T>(write: Promise<T>): Promise<T> {
  const result = await write;
  invalidateHostDisplayCache();
  return result;
}

export async function loadHostInputForDisplay(db: DbOrTx, input: HostDataInput): Promise<HostInput> {
  const key = [input.hostId, input.window.start, input.window.end, input.eventType?.id ?? "", JSON.stringify(input.eventType?.limits ?? {}), input.eventType?.seats ?? ""].join("|");
  const { ownHoldHash, ...rest } = input;
  return withHolds(await displayCache.get(key, () => loadHostData(db, rest)), ownHoldHash);
}
