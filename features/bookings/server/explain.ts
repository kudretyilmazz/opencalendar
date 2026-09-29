import { inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { booking } from "@/db/schema";
import { computeSlots } from "@/lib/availability";
import { addDays, parseDate, wallToUtc } from "@/lib/availability/tz";
import type { ExclusionReason } from "@/lib/availability/types";
import { type EventTypeView, type PublicHost, toEngineEvent } from "@/features/event-types/server/service";
import { scheduleForEventType, toScheduleInput } from "@/features/schedules/server/service";
import type { ExternalBusyFn } from "./core";
import { loadHostInput } from "./host-data";

/**
 * Availability explainability (AVL-008): every candidate slot of one local day with its status,
 * reason code and the object behind it, for the host (or a team admin, for a team event type's
 * hosts). This is the owner-side counterpart
 * of the public slot list, which never reveals reasons.
 */

export type ExplainedSlot = { start: number; end: number; status: "available" | ExclusionReason; source?: string; seatsRemaining?: number };

export const REASON_LABELS: Record<ExclusionReason, string> = {
  min_notice: "Too soon (minimum notice)",
  beyond_horizon: "Outside the booking window",
  outside_working_hours: "Outside your working hours",
  date_override: "Date override",
  ooo: "Out of office",
  booking_conflict: "Another booking",
  external_calendar_busy: "Busy in a connected calendar",
  buffer: "Buffer around another booking",
  slot_held: "Held by someone filling in the form",
  limit_reached: "Booking limit reached",
  seats_full: "All seats taken",
};

export async function explainDay(
  db: Database,
  input: {
    host: PublicHost;
    eventType: EventTypeView;
    date: string;
    now: number;
    externalBusy?: ExternalBusyFn;
    /** Team event types: the host's own schedule choice (null = their default). */
    scheduleId?: string | null;
    /**
     * Show booking titles and calendar names as sources. Off when a team admin looks at a member:
     * the member's other meetings stay private, only that the time is taken shows.
     */
    revealSources?: boolean;
  },
): Promise<{ timeZone: string; slots: ExplainedSlot[] }> {
  const sched = await scheduleForEventType(db, input.host.id, input.scheduleId !== undefined ? input.scheduleId : input.eventType.scheduleId);
  if (!sched) return { timeZone: input.host.timeZone, slots: [] };
  const day = parseDate(input.date);
  const window = { start: wallToUtc(day, 0, sched.timeZone), end: wallToUtc(addDays(day, 1), 0, sched.timeZone) };
  const engineEvent = toEngineEvent(input.eventType);
  const [host, external] = await Promise.all([
    loadHostInput(db, {
      hostId: input.host.id,
      schedule: toScheduleInput(sched),
      window,
      now: input.now,
      eventType: { id: input.eventType.id, limits: engineEvent.limits, seats: engineEvent.seats },
    }),
    input.externalBusy?.(window),
  ]);
  const result = computeSlots(engineEvent, external ? { ...host, externalBusy: external } : host, { now: input.now, window, explain: true });
  const excluded = result.excluded ?? [];
  const uids = [...new Set(excluded.filter((e) => e.reason === "booking_conflict" || e.reason === "buffer" || e.reason === "seats_full").flatMap((e) => (e.ref ? [e.ref] : [])))];
  const titles = uids.length ? await db.select({ uid: booking.uid, title: booking.title }).from(booking).where(inArray(booking.uid, uids)) : [];
  const titleOf = new Map(titles.map((t) => [t.uid, t.title]));
  const slots: ExplainedSlot[] = [
    ...result.slots.map((s) => ({ start: s.start, end: s.end, status: "available" as const, ...(s.seatsRemaining !== undefined && { seatsRemaining: s.seatsRemaining }) })),
    ...excluded.map((e) => {
      // The rule behind working-hours reasons is the schedule itself (AVL-008 "source object").
      const rule = e.reason === "outside_working_hours" || e.reason === "date_override" ? `Schedule “${sched.name}”` : undefined;
      const source = e.ref ? (input.revealSources === false ? undefined : (titleOf.get(e.ref) ?? e.ref)) : rule;
      return { start: e.start, end: e.end, status: e.reason, ...(source && { source }) };
    }),
  ];
  return { timeZone: sched.timeZone, slots: slots.toSorted((a, b) => a.start - b.start) };
}
