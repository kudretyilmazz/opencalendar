import ICAL from "ical.js";
import { isValidTimeZone, wallToUtc } from "@/lib/availability/tz";
import { IntegrationError } from "./errors";
import type { BusyInterval } from "./types";

type IcalTime = InstanceType<typeof ICAL.Time>;
type IcalComponent = InstanceType<typeof ICAL.Component>;
type IcalTimezone = InstanceType<typeof ICAL.Timezone>;

const MAX_OCCURRENCES_PER_EVENT = 20_000;
/** Expansion budget for a whole call, so one hostile feed can't stall the process. */
const MAX_OCCURRENCES_TOTAL = 100_000;

/**
 * Busy intervals from iCalendar data (CalDAV objects and ICS feeds, INT-004/005):
 * - recurring events are expanded (RRULE/RDATE/EXDATE and RECURRENCE-ID overrides);
 * - TRANSP:TRANSPARENT and STATUS:CANCELLED occurrences are ignored;
 * - times use the file's own VTIMEZONE definitions, then IANA names, and floating or all-day
 *   values are read in `fallbackTimeZone` (the host's zone).
 * Time zones are resolved per call (no global registry), so feeds can't affect each other.
 */
export function busyFromIcs(
  sources: string | string[],
  range: { start: number; end: number },
  fallbackTimeZone: string,
): BusyInterval[] {
  const components = (Array.isArray(sources) ? sources : [sources]).map(parseCalendar);
  const zones = new Map<string, IcalTimezone>();
  for (const cal of components) {
    for (const vtz of cal.getAllSubcomponents("vtimezone")) {
      const id = String(vtz.getFirstPropertyValue("tzid"));
      if (!zones.has(id)) zones.set(id, new ICAL.Timezone(vtz));
    }
  }

  // Group by UID so RECURRENCE-ID overrides attach to their master event.
  const byUid = new Map<string, { master?: IcalComponent; exceptions: IcalComponent[] }>();
  for (const cal of components) {
    for (const vevent of cal.getAllSubcomponents("vevent")) {
      const uid = String(vevent.getFirstPropertyValue("uid") ?? Math.random());
      const group = byUid.get(uid) ?? { exceptions: [] };
      if (vevent.hasProperty("recurrence-id")) group.exceptions.push(vevent);
      else group.master = vevent;
      byUid.set(uid, group);
    }
  }

  const busy: BusyInterval[] = [];
  const toMs = (time: IcalTime, owner: IcalComponent, prop: "dtstart" | "dtend") =>
    timeToMs(time, owner.getFirstProperty(prop)?.getParameter("tzid") as string | undefined, zones, fallbackTimeZone);

  let budget = MAX_OCCURRENCES_TOTAL;
  for (const [uid, group] of byUid) {
    const push = (item: InstanceType<typeof ICAL.Event>, start: IcalTime, end: IcalTime) => {
      const comp = item.component;
      if (isFree(comp)) return;
      const s = toMs(start, comp, "dtstart");
      const e = end ? toMs(end, comp, comp.hasProperty("dtend") ? "dtend" : "dtstart") : s;
      if (e > range.start && s < range.end && e > s) busy.push({ start: s, end: e, externalEventId: uid });
    };
    if (!group.master) {
      // Overrides without their series (e.g. a shared single occurrence): each one is busy.
      for (const ex of group.exceptions) {
        const one = new ICAL.Event(ex);
        push(one, one.startDate, one.endDate);
      }
      continue;
    }
    const event = new ICAL.Event(group.master);
    for (const ex of group.exceptions) event.relateException(ex);

    if (!event.isRecurring()) {
      push(event, event.startDate, event.endDate);
      continue;
    }
    const iterator = event.iterator();
    let reachedEnd = false;
    let lastStart = range.start;
    let next = iterator.next();
    const cap = Math.min(MAX_OCCURRENCES_PER_EVENT, budget);
    let i = 0;
    for (; next && i < cap; i++, next = iterator.next()) {
      const details = event.getOccurrenceDetails(next);
      const start = toMs(details.startDate, details.item.component, "dtstart");
      if (start >= range.end) {
        reachedEnd = true;
        break;
      }
      lastStart = start;
      push(details.item, details.startDate, details.endDate);
    }
    budget -= i;
    // Too many occurrences to expand before the range ends: fail closed for the remainder
    // instead of silently treating it as free.
    if (!reachedEnd && next) busy.push({ start: Math.max(range.start, lastStart), end: range.end, externalEventId: uid });
  }
  return busy.toSorted((a, b) => a.start - b.start);
}

function parseCalendar(text: string): IcalComponent {
  try {
    const component = new ICAL.Component(ICAL.parse(text));
    if (component.name !== "vcalendar") throw new Error("not a calendar");
    return component;
  } catch {
    throw new IntegrationError("invalid", "The calendar data could not be parsed");
  }
}

function isFree(comp: IcalComponent): boolean {
  const transp = String(comp.getFirstPropertyValue("transp") ?? "").toUpperCase();
  const status = String(comp.getFirstPropertyValue("status") ?? "").toUpperCase();
  return transp === "TRANSPARENT" || status === "CANCELLED";
}

function timeToMs(time: IcalTime, tzid: string | undefined, zones: Map<string, IcalTimezone>, fallback: string): number {
  const date = { year: time.year, month: time.month, day: time.day };
  if (time.isDate) return wallToUtc(date, 0, fallback);
  const minutes = time.hour * 60 + time.minute + time.second / 60;
  if (time.zone === ICAL.Timezone.utcTimezone || time.zone?.tzid === "UTC" || tzid === "UTC") {
    return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  }
  const zone = tzid ? zones.get(tzid) : undefined;
  if (zone) {
    // utcOffset() reads the VTIMEZONE rules for this wall time (seconds east of UTC).
    const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
    return wall - zone.utcOffset(time) * 1000;
  }
  const iana = tzid && isValidTimeZone(tzid) ? tzid : fallback;
  return wallToUtc(date, minutes, iana);
}
