import { prefers12Hour } from "@/lib/format";
import { buildIcs, buildIcsCalendar, type IcsEvent } from "@/lib/ics";
import type { EmailRequest } from "@/lib/jobs/queues";
import type { AttendeeRow, BookingDetails, BookingRow } from "./service";

/**
 * Booking emails (NTF-002/003/004): one per participant, each in the recipient's own time zone,
 * locale and clock (I18N-001). Only the booker gets the tokenized manage link; guests get the
 * read-only page (BKG-011); the host is pointed at the dashboard.
 */
export type BookingEmailEvent =
  | {
      kind: "scheduled";
      details: BookingDetails;
      token: string;
      rescheduled: boolean;
      accepted?: boolean;
      /** A new host took over (TEAM-002). */
      reassigned?: boolean;
      /** Seated events: only this seat (and the host) is emailed (EVT-012). */
      seat?: AttendeeRow;
      /** Recurring series (EVT-013); `details` is the first occurrence. */
      series?: readonly BookingRow[];
    }
  | {
      kind: "requested";
      details: BookingDetails;
      token: string;
      decision?: { acceptUrl: string; rejectUrl: string };
      series?: readonly BookingRow[];
    }
  | { kind: "rejected"; details: BookingDetails; rebookUrl?: string }
  | { kind: "cancelled"; details: BookingDetails; rebookUrl?: string; skipHost?: boolean; seat?: AttendeeRow };

export const bookingLocation = (b: BookingDetails["booking"]) => b.locationValue ?? undefined;

export function manageUrl(appUrl: string, uid: string, token?: string): string {
  return `${appUrl}/booking/${encodeURIComponent(uid)}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

/**
 * Notes a viewer may read: never for guests; on seated events only the viewer's own seat notes
 * (the shared booking row has none). The host (no viewer) sees the booking's notes.
 */
function privateNotes(details: BookingDetails, row: BookingRow, viewer?: AttendeeRow): string | null {
  if (viewer?.isGuest) return null;
  if (details.eventType.seatsPerSlot !== null) return viewer?.notes ?? null;
  return row.notes;
}

/** Attendees a given viewer may see: seated events hide other seats unless allowed (EVT-012). */
function visibleAttendees(details: BookingDetails, viewer?: AttendeeRow): AttendeeRow[] {
  const seated = details.eventType.seatsPerSlot !== null;
  if (!seated || details.eventType.seatsShowAttendees || !viewer) return details.attendees;
  return details.attendees.filter((a) => a.id === viewer.id);
}

function icsEvent(details: BookingDetails, row: BookingRow, appUrl: string, now: number, options: { anonymous?: boolean; viewer?: AttendeeRow } = {}): IcsEvent {
  const hostname = new URL(appUrl).hostname;
  return {
    uid: `${row.icalUid}@${hostname}`,
    sequence: row.sequence,
    start: row.startAt.getTime(),
    end: row.endAt.getTime(),
    stamp: now,
    summary: row.title,
    description: privateNotes(details, row, options.viewer) ?? undefined,
    location: bookingLocation(row),
    url: manageUrl(appUrl, row.uid),
    organizer: { name: details.host.name, email: options.anonymous ? `no-reply@${hostname}` : details.host.email },
    attendees: [
      ...visibleAttendees(details, options.viewer).map((a) => ({ name: a.name, email: a.email })),
      // Collective co-hosts attend too (TEAM-004); hidden from anonymous downloads.
      ...(options.anonymous ? [] : coHosts(details).map((h) => ({ name: h.name, email: h.email }))),
    ],
  };
}

/** Hosts besides the organizer (collective bookings, TEAM-004). */
export const coHosts = (details: BookingDetails) => (details.hosts ?? []).filter((h) => h.id !== details.host.id);

/**
 * iCalendar for a booking. `anonymous` hides the host's email (tokenless downloads, BKG-011):
 * the organizer becomes a no-reply address on this instance's domain.
 */
export function bookingIcs(
  details: BookingDetails,
  method: "REQUEST" | "CANCEL",
  appUrl: string,
  now: number,
  options: { anonymous?: boolean; viewer?: AttendeeRow } = {},
): string {
  return buildIcs({ ...icsEvent(details, details.booking, appUrl, now, options), method });
}

/** Answers as label/value pairs, in question order (EVT-009). */
export function answerList(details: BookingDetails, responses?: BookingRow["responses"] | null): { label: string; value: string }[] {
  const values = responses ?? details.booking.responses;
  return details.eventType.questions
    .filter((q) => values[q.key] !== undefined && values[q.key] !== "")
    .map((q) => {
      const v = values[q.key];
      return { label: q.label, value: Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v) };
    });
}

type Recipient = { to: string; guest: boolean; audience: "attendee" | "host"; timeZone: string; locale: string; hour12: boolean; link: string; viewer?: AttendeeRow };

function recipients(event: BookingEmailEvent, appUrl: string): Recipient[] {
  const { attendees, host, booking: b } = event.details;
  const only = "seat" in event && event.seat ? [event.seat] : attendees;
  const token = event.kind === "scheduled" || event.kind === "requested" ? event.token : undefined;
  const people = only.map(
    (a): Recipient => ({
      to: a.email,
      guest: a.isGuest,
      audience: "attendee",
      timeZone: a.timeZone,
      locale: a.locale,
      hour12: prefers12Hour(a.locale),
      link: manageUrl(appUrl, b.uid, a.isGuest ? undefined : token),
      viewer: a,
    }),
  );
  if (event.kind === "rejected" || (event.kind === "cancelled" && event.skipHost)) return people;
  // Every host is told, each in their own settings: the organizer and collective co-hosts.
  return [
    ...people,
    ...[host, ...coHosts(event.details)].map(
      (h): Recipient => ({ to: h.email, guest: false, audience: "host", timeZone: h.timeZone, locale: h.locale, hour12: h.timeFormat === 12, link: `${appUrl}/bookings` }),
    ),
  ];
}

export function buildBookingEmails(event: BookingEmailEvent, appUrl: string, now: number): EmailRequest[] {
  const { booking: b, attendees } = event.details;
  const booker = ("seat" in event && event.seat) || attendees.find((a) => !a.isGuest) || attendees[0];
  const series = "series" in event ? event.series : undefined;
  const common = {
    title: b.title,
    start: b.startAt.getTime(),
    end: b.endAt.getTime(),
    hostName: event.details.host.name,
    attendeeName: booker.name,
    attendeeEmail: booker.email,
    ...(bookingLocation(b) && { location: bookingLocation(b) }),
    ...(series && { occurrences: series.map((o) => ({ start: o.startAt.getTime(), end: o.endAt.getTime() })) }),
  };
  const answers = answerList(event.details, "seat" in event && event.seat ? event.seat.responses : undefined);
  /** Seat cancellation while the booking itself goes on (EVT-012). */
  const seatOnly = event.kind === "cancelled" && Boolean(event.seat) && b.status !== "cancelled";

  return recipients(event, appUrl).map((r): EmailRequest => {
    const view = { ...common, audience: r.audience, timeZone: r.timeZone, locale: r.locale, hour12: r.hour12 };
    const viewer = r.audience === "attendee" ? r.viewer : undefined;
    // The booker's notes and answers go to the host and the booker only, never to guests.
    const notes = privateNotes(event.details, b, viewer ?? ("seat" in event ? event.seat : undefined));
    const privateBits = r.guest ? {} : { ...(notes && { notes }), ...(answers.length && { answers }) };
    switch (event.kind) {
      case "scheduled": {
        const ics = series
          ? { method: "PUBLISH" as const, content: buildIcsCalendar(series.map((o) => icsEvent(event.details, o, appUrl, now, { viewer })), "PUBLISH") }
          : { method: "REQUEST" as const, content: bookingIcs(event.details, "REQUEST", appUrl, now, { viewer }) };
        return {
          to: r.to,
          template: "booking-scheduled",
          props: {
            ...view,
            ics,
            rescheduled: event.rescheduled,
            ...(event.accepted && { accepted: true }),
            ...(event.reassigned && { reassigned: true }),
            manageUrl: r.link,
            ...privateBits,
          },
        };
      }
      case "requested":
        return {
          to: r.to,
          template: "booking-requested",
          props: { ...view, manageUrl: r.link, ...privateBits, ...(r.audience === "host" && event.decision) },
        };
      case "rejected":
        return {
          to: r.to,
          template: "booking-rejected",
          props: { ...view, ...(b.rejectionReason && { reason: b.rejectionReason }), ...(event.rebookUrl && { rebookUrl: event.rebookUrl }) },
        };
      case "cancelled":
        return {
          to: r.to,
          template: "booking-cancelled",
          props: {
            ...view,
            // A single seat leaving must not cancel the host's (still running) event.
            ...(!(seatOnly && r.audience === "host") && { ics: { method: "CANCEL" as const, content: bookingIcs(event.details, "CANCEL", appUrl, now, { viewer }) } }),
            cancelledBy: b.cancelledBy ?? (event.seat ? "attendee" : "system"),
            ...(b.cancellationReason && { reason: b.cancellationReason }),
            ...(r.audience === "attendee" && event.rebookUrl && { rebookUrl: event.rebookUrl }),
          },
        };
    }
  });
}
