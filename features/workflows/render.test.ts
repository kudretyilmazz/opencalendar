import { describe, expect, it } from "vitest";
import { renderSubject, renderTemplate, type TemplateContext } from "./render";

const ctx: TemplateContext = {
  eventName: "Intro",
  hostName: "Ada",
  attendeeName: "Grace",
  attendeeEmail: "grace@x.test",
  start: Date.parse("2026-10-05T09:00:00Z"),
  end: Date.parse("2026-10-05T09:30:00Z"),
  location: null,
  bookingUrl: "https://cal.example.com/booking/U1",
  cancelUrl: "https://cal.example.com/booking/U1?token=t",
  rescheduleUrl: "",
  answers: [{ label: "Company", value: "ACME" }],
};

describe("workflow templates (NTF-005)", () => {
  it("fills variables in the recipient's zone and clock", () => {
    const text = renderTemplate("{event_name} with {host_name} on {date} at {time}–{end_time} ({timezone}) {location}\n{answers}", ctx, {
      locale: "en-US",
      timeZone: "America/New_York",
      hour12: true,
    });
    expect(text).toBe("Intro with Ada on Monday, October 5, 2026 at 5:00 AM–5:30 AM (America/New_York) —\nCompany: ACME");
  });

  it("fills cancel/reschedule links, or a dash when the recipient has none", () => {
    expect(renderTemplate("{cancel_url} {reschedule_url}", ctx, { locale: "en", timeZone: "UTC", hour12: false })).toBe("https://cal.example.com/booking/U1?token=t —");
  });

  it("leaves unknown placeholders and keeps subjects on one line", () => {
    expect(renderTemplate("{nope} {attendee_email}", ctx, { locale: "en", timeZone: "UTC", hour12: false })).toBe("{nope} grace@x.test");
    const evil = { ...ctx, attendeeName: "Bob\r\nBcc: x@evil.test" };
    expect(renderSubject("Hi {attendee_name}", evil, { locale: "en", timeZone: "UTC", hour12: false })).toBe("Hi Bob Bcc: x@evil.test");
  });
});
