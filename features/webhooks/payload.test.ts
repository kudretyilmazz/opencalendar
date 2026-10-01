import { describe, expect, it } from "vitest";
import type { BookingDetails } from "@/features/bookings/server/service";
import { buildBookingPayload, buildEnvelope, webhookEnvelopeSchema } from "./payload";

const start = new Date("2026-10-05T10:00:00Z");
const end = new Date("2026-10-05T10:30:00Z");

function details(patch: Partial<BookingDetails["booking"]> = {}): BookingDetails {
  return {
    booking: {
      id: "b1",
      uid: "uid1",
      manageTokenHash: "secret-hash",
      icalUid: "ical",
      sequence: 0,
      eventTypeId: "et1",
      organizerId: "u1",
      status: "accepted",
      title: "Intro",
      startAt: start,
      endAt: end,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      timeZone: "UTC",
      locationKind: "link",
      locationValue: "https://meet.example.com/x",
      notes: null,
      rescheduledFromId: null,
      rescheduled: false,
      rescheduleRequestedAt: null,
      rescheduleRequestMessage: null,
      cancellationReason: null,
      cancelledBy: null,
      cancelledAt: null,
      idempotencyKey: null,
      source: "web",
      responses: { company: "Acme" },
      utm: { utm_source: "news" },
      recurringSeriesId: null,
      hostNoShow: false,
      decidedAt: null,
      rejectionReason: null,
      createdAt: start,
      updatedAt: start,
      ...patch,
    } as BookingDetails["booking"],
    attendees: [
      {
        id: "a1",
        bookingId: "b1",
        name: "Grace",
        email: "grace@example.com",
        timeZone: "Europe/Istanbul",
        locale: "en",
        phone: null,
        isGuest: false,
        seatTokenHash: "seat-hash",
        responses: null,
        notes: null,
        noShow: true,
        createdAt: start,
      },
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
      questions: [],
    },
    host: { id: "u1", name: "Ada", email: "ada@example.com", username: "ada", timeZone: "UTC", locale: "en", timeFormat: 24, image: null },
    hosts: [{ id: "u1", name: "Ada", email: "ada@example.com", username: "ada", timeZone: "UTC", locale: "en", timeFormat: 24, image: null }],
  };
}

describe("buildBookingPayload (API-005)", () => {
  it("maps booking details to the v1 schema without tokens", () => {
    const { booking } = buildBookingPayload(details(), { rescheduledFromUid: "old-uid" });
    expect(booking).toMatchObject({
      uid: "uid1",
      status: "accepted",
      start: "2026-10-05T10:00:00.000Z",
      end: "2026-10-05T10:30:00.000Z",
      location: { kind: "link", value: "https://meet.example.com/x" },
      responses: { company: "Acme" },
      utm: { utm_source: "news" },
      noShow: { host: false },
      eventType: { id: "et1", slug: "intro", title: "Intro" },
      organizer: { name: "Ada", email: "ada@example.com", timeZone: "UTC", username: "ada" },
      attendees: [{ name: "Grace", email: "grace@example.com", timeZone: "Europe/Istanbul", locale: "en", noShow: true, isGuest: false }],
      rescheduledFromUid: "old-uid",
    });
    expect(booking).not.toHaveProperty("cancellation");
    expect(JSON.stringify(booking)).not.toMatch(/hash|token/i);
  });

  it("adds cancellation and rejection details", () => {
    const cancelled = buildBookingPayload(details({ status: "cancelled", cancelledBy: "host", cancellationReason: "Sick", locationKind: null }));
    expect(cancelled.booking.cancellation).toEqual({ by: "host", reason: "Sick" });
    expect(cancelled.booking.location).toBeNull();
    const rejected = buildBookingPayload(details({ status: "rejected", rejectionReason: "Busy", utm: null }));
    expect(rejected.booking.rejectionReason).toBe("Busy");
    expect(rejected.booking.utm).toBeNull();
  });

  it("wraps payloads in a versioned envelope", () => {
    const envelope = buildEnvelope({ id: "d1", trigger: "BOOKING_CREATED", createdAt: start, payload: buildBookingPayload(details()) });
    expect(envelope).toMatchObject({ version: 1, id: "d1", trigger: "BOOKING_CREATED", createdAt: "2026-10-05T10:00:00.000Z" });
    expect(webhookEnvelopeSchema.parse(JSON.parse(JSON.stringify(envelope)))).toEqual(envelope);
    expect(buildEnvelope({ id: "d2", trigger: "PING", createdAt: start, payload: { ping: true, webhookId: "w1" } }).payload).toEqual({ ping: true, webhookId: "w1" });
  });
});
