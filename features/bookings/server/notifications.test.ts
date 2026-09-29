import { describe, expect, it } from "vitest";
import { emailContent } from "@/lib/jobs/queues";
import { bookingIcs, buildBookingEmails } from "./notifications";
import type { BookingDetails } from "./service";

const details = (patch: Partial<BookingDetails["booking"]> = {}): BookingDetails => ({
  booking: {
    id: "b1",
    uid: "UID123",
    manageTokenHash: "x",
    icalUid: "ICAL1",
    sequence: 0,
    eventTypeId: "et1",
    organizerId: "h1",
    status: "accepted",
    title: "Intro between Ada and Grace",
    startAt: new Date("2026-10-05T09:00:00Z"),
    endAt: new Date("2026-10-05T09:30:00Z"),
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    timeZone: "America/New_York",
    locationKind: "link",
    locationValue: "https://meet.example.com/x",
    notes: "Agenda",
    rescheduledFromId: null,
    assignmentReason: null,
    manageTokenSealed: null,
    routingFormResponseId: null,
    rescheduled: false,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAt: null,
    idempotencyKey: null,
    source: "web",
    responses: {},
    utm: null,
    recurringSeriesId: null,
    hostNoShow: false,
    decidedAt: null,
    rejectionReason: null,
    pendingTokenSealed: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  },
  attendees: [
    { id: "a1", bookingId: "b1", name: "Grace", email: "grace@x.test", timeZone: "America/New_York", locale: "en-US", phone: null, isGuest: false, seatTokenHash: null, responses: null, notes: null, noShow: false, createdAt: new Date() },
    { id: "a2", bookingId: "b1", name: "guest@x.test", email: "guest@x.test", timeZone: "America/New_York", locale: "en-US", phone: null, isGuest: true, seatTokenHash: null, responses: null, notes: null, noShow: false, createdAt: new Date() },
  ],
  eventType: {
    id: "et1",
    title: "Intro",
    slug: "intro",
    seatsPerSlot: null,
    seatsShowAttendees: false,
    disableCancelling: false,
    disableRescheduling: false,
    cancelCutoffMinutes: null,
    questions: [{ key: "company", label: "Company" }],
  },
  host: { id: "h1", name: "Ada", email: "ada@x.test", username: "ada", timeZone: "Europe/Istanbul", locale: "tr", timeFormat: 24, image: null },
  hosts: [{ id: "h1", name: "Ada", email: "ada@x.test", username: "ada", timeZone: "Europe/Istanbul", locale: "tr", timeFormat: 24, image: null }],
});

const APP = "https://cal.example.com";
const NOW = Date.parse("2026-10-01T00:00:00Z");

describe("buildBookingEmails (NTF-002, NTF-003)", () => {
  it("emails the attendee, guests and host, each in their own zone and clock", () => {
    const emails = buildBookingEmails({ kind: "scheduled", details: details(), token: "SECRET", rescheduled: false }, APP, NOW);
    expect(emails.map((e) => e.to)).toEqual(["grace@x.test", "guest@x.test", "ada@x.test"]);
    for (const e of emails) expect(emailContent.safeParse(e).success).toBe(true);
    const [attendee, guest, host] = emails.map((e) => (e.template === "booking-scheduled" ? e.props : null)!);
    expect(attendee).toMatchObject({ audience: "attendee", timeZone: "America/New_York", hour12: true });
    expect(host).toMatchObject({ audience: "host", timeZone: "Europe/Istanbul", hour12: false, manageUrl: `${APP}/bookings` });
    expect(attendee.manageUrl).toBe(`${APP}/booking/UID123?token=SECRET`);
    expect(guest.manageUrl).toBe(`${APP}/booking/UID123`); // guests can't cancel
    expect(attendee.notes).toBe("Agenda");
    expect(host.notes).toBe("Agenda");
    expect(guest.notes).toBeUndefined(); // booker-supplied text is not relayed to guests
    expect(attendee.ics.method).toBe("REQUEST");
    expect(attendee.ics!.content).toContain("UID:ICAL1@cal.example.com");
  });

  it("sends CANCEL invitations with the bumped sequence and the reason", () => {
    const d = details({ status: "cancelled", sequence: 1, cancelledBy: "host", cancellationReason: "Conflict" });
    const emails = buildBookingEmails({ kind: "cancelled", details: d, rebookUrl: `${APP}/ada/intro` }, APP, NOW);
    const [attendee, , host] = emails.map((e) => (e.template === "booking-cancelled" ? e.props : null)!);
    expect(attendee).toMatchObject({ cancelledBy: "host", reason: "Conflict", rebookUrl: `${APP}/ada/intro` });
    expect(host.rebookUrl).toBeUndefined();
    expect(attendee.ics!.content).toContain("METHOD:CANCEL");
    expect(attendee.ics!.content).toContain("SEQUENCE:1");
  });

  it("can leave the host out (account deletion)", () => {
    const d = details({ status: "cancelled", sequence: 1, cancelledBy: "system" });
    const emails = buildBookingEmails({ kind: "cancelled", details: d, skipHost: true }, APP, NOW);
    expect(emails.map((e) => e.to)).toEqual(["grace@x.test", "guest@x.test"]);
  });
});

describe("bookingIcs", () => {
  it("hides the host's email in anonymous (tokenless) downloads", () => {
    expect(bookingIcs(details(), "REQUEST", APP, NOW)).toContain("mailto:ada@x.test");
    const anon = bookingIcs(details(), "REQUEST", APP, NOW, { anonymous: true });
    expect(anon).not.toContain("ada@x.test");
    expect(anon).toContain("mailto:no-reply@cal.example.com");
  });
});

describe("M3 booking emails (NTF-004, EVT-012, EVT-013)", () => {
  it("booking requests: the host gets accept/reject links, the booker a waiting notice without an invitation", () => {
    const d = details({ status: "pending", responses: { company: "ACME" } });
    const emails = buildBookingEmails({ kind: "requested", details: d, token: "T", decision: { acceptUrl: `${APP}/a`, rejectUrl: `${APP}/r` } }, APP, NOW);
    const [booker, guest, host] = emails.map((e) => (e.template === "booking-requested" ? e.props : null)!);
    expect(host).toMatchObject({ audience: "host", acceptUrl: `${APP}/a`, rejectUrl: `${APP}/r`, answers: [{ label: "Company", value: "ACME" }] });
    expect(booker.acceptUrl).toBeUndefined();
    expect(booker.manageUrl).toBe(`${APP}/booking/UID123?token=T`);
    expect(guest.answers).toBeUndefined();
    for (const e of emails) expect(emailContent.safeParse(e).success).toBe(true);
  });

  it("rejections go to the attendees only, with the reason", () => {
    const d = details({ status: "rejected", rejectionReason: "Fully booked" });
    const emails = buildBookingEmails({ kind: "rejected", details: d, rebookUrl: `${APP}/ada/intro` }, APP, NOW);
    expect(emails.map((e) => e.to)).toEqual(["grace@x.test", "guest@x.test"]);
    expect(emails[0]).toMatchObject({ template: "booking-rejected", props: { reason: "Fully booked", rebookUrl: `${APP}/ada/intro` } });
  });

  it("seats: only the new seat and the host are emailed, and other seats stay hidden", () => {
    const base = details();
    const seat = { ...base.attendees[0], id: "s2", email: "seat2@x.test", name: "Seat Two", isGuest: false, seatTokenHash: "h" };
    const d: typeof base = {
      ...base,
      attendees: [{ ...base.attendees[0], seatTokenHash: "h1" }, seat],
      eventType: { ...base.eventType, seatsPerSlot: 5, seatsShowAttendees: false },
    };
    const emails = buildBookingEmails({ kind: "scheduled", details: d, token: "SEAT", rescheduled: false, seat }, APP, NOW);
    expect(emails.map((e) => e.to)).toEqual(["seat2@x.test", "ada@x.test"]);
    const ics = emails[0].template === "booking-scheduled" ? emails[0].props.ics.content : "";
    expect(ics).toContain("seat2@x.test");
    expect(ics).not.toContain("grace@x.test");
    expect(emails[0].template === "booking-scheduled" && emails[0].props.manageUrl).toBe(`${APP}/booking/UID123?token=SEAT`);
  });

  it("a recurring series is one email listing every date, with all occurrences in one calendar file", () => {
    const d = details();
    const second = { ...d.booking, id: "b2", uid: "UID2", icalUid: "ICAL2", startAt: new Date("2026-10-12T09:00:00Z"), endAt: new Date("2026-10-12T09:30:00Z") };
    const emails = buildBookingEmails({ kind: "scheduled", details: d, token: "T", rescheduled: false, series: [d.booking, second] }, APP, NOW);
    const props = emails[0].template === "booking-scheduled" ? emails[0].props : null;
    expect(props?.occurrences).toHaveLength(2);
    expect(props?.ics.method).toBe("PUBLISH");
    expect(props?.ics.content).toContain("UID:ICAL1@cal.example.com");
    expect(props?.ics.content).toContain("UID:ICAL2@cal.example.com");
    expect(emailContent.safeParse(emails[0]).success).toBe(true);
  });
});

describe("seat privacy (EVT-012)", () => {
  const seatedDetails = () => {
    const base = details({ notes: null, responses: {} });
    const one = { ...base.attendees[0], id: "s1", seatTokenHash: "h1", notes: "private note of seat one" };
    const two = { ...base.attendees[0], id: "s2", email: "two@x.test", name: "Two", seatTokenHash: "h2", notes: null };
    return { ...base, attendees: [one, two], eventType: { ...base.eventType, seatsPerSlot: 5, seatsShowAttendees: false } };
  };

  it("never puts one seat's notes into another seat's calendar file", () => {
    const d = seatedDetails();
    expect(bookingIcs(d, "REQUEST", APP, NOW, { viewer: d.attendees[1] })).not.toContain("private note");
    expect(bookingIcs(d, "REQUEST", APP, NOW, { viewer: d.attendees[0] })).toContain("private note of seat one");
  });

  it("a seat leaving sends the seat a CANCEL but leaves the host's event alone", () => {
    const d = seatedDetails();
    const emails = buildBookingEmails({ kind: "cancelled", details: d, seat: d.attendees[1] }, APP, NOW);
    expect(emails.map((e) => e.to)).toEqual(["two@x.test", "ada@x.test"]);
    const [seat, host] = emails.map((e) => (e.template === "booking-cancelled" ? e.props : null)!);
    expect(seat.ics?.method).toBe("CANCEL");
    expect(host.ics).toBeUndefined();
    for (const e of emails) expect(emailContent.safeParse(e).success).toBe(true);
  });
});
