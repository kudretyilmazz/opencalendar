import { describe, expect, it } from "vitest";
import { buildIcs, type IcsEvent } from "./ics";

const base: IcsEvent = {
  uid: "abc123@opencalendar",
  sequence: 0,
  method: "REQUEST",
  start: Date.parse("2026-10-05T09:00:00Z"),
  end: Date.parse("2026-10-05T09:30:00Z"),
  stamp: Date.parse("2026-10-01T12:00:00Z"),
  summary: "Intro call between Ada and Grace",
  description: "Notes: bring the agenda",
  location: "https://meet.example.com/x",
  organizer: { name: "Ada", email: "ada@example.com" },
  attendees: [{ name: "Grace", email: "grace@example.com" }],
  url: "https://cal.example.com/booking/abc?token=t",
};

const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("buildIcs (NTF-002, NTF-003)", () => {
  it("produces a CRLF iCalendar REQUEST with stable UID, UTC times and participants", () => {
    const ics = buildIcs(base);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    const text = unfold(ics);
    for (const line of [
      "METHOD:REQUEST",
      "UID:abc123@opencalendar",
      "SEQUENCE:0",
      "DTSTART:20261005T090000Z",
      "DTEND:20261005T093000Z",
      "DTSTAMP:20261001T120000Z",
      "STATUS:CONFIRMED",
      "ORGANIZER;CN=Ada:mailto:ada@example.com",
    ]) {
      expect(text).toContain(`${line}\r\n`);
    }
    expect(text).toContain("ATTENDEE;CN=Grace;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:grace@example.com");
  });

  it("marks cancellations with METHOD:CANCEL and STATUS:CANCELLED at a higher sequence", () => {
    const text = unfold(buildIcs({ ...base, method: "CANCEL", sequence: 2 }));
    expect(text).toContain("METHOD:CANCEL\r\n");
    expect(text).toContain("STATUS:CANCELLED\r\n");
    expect(text).toContain("SEQUENCE:2\r\n");
  });

  it("escapes text values and quotes parameters with special characters", () => {
    const text = unfold(
      buildIcs({ ...base, summary: "A, B; C\\D", description: "line1\nline2", organizer: { name: "Doe, Jane", email: "j@x.test" } }),
    );
    expect(text).toContain("SUMMARY:A\\, B\\; C\\\\D\r\n");
    expect(text).toContain("DESCRIPTION:line1\\nline2\r\n");
    expect(text).toContain('ORGANIZER;CN="Doe, Jane":mailto:j@x.test');
  });

  it("strips characters that could inject new properties", () => {
    const text = unfold(buildIcs({ ...base, organizer: { name: 'Evil"\r\nX-INJECT:1', email: "e@x.test" } }));
    expect(text).not.toContain("\r\nX-INJECT");
  });

  it("folds lines longer than 75 octets", () => {
    const ics = buildIcs({ ...base, description: "x".repeat(300) });
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`DESCRIPTION:${"x".repeat(300)}\r\n`);
  });

  it("never splits a multi-byte character when folding", () => {
    const ics = buildIcs({ ...base, summary: "ğ".repeat(80) });
    expect(unfold(ics)).toContain(`SUMMARY:${"ğ".repeat(80)}`);
  });

  it("omits METHOD for stored calendar objects (CalDAV)", () => {
    const text = buildIcs({ ...base, method: undefined });
    expect(text).not.toContain("METHOD:");
    expect(text).toContain("STATUS:CONFIRMED");
  });

  it("omits optional properties when absent", () => {
    const text = buildIcs({ ...base, location: undefined, description: undefined, url: undefined });
    expect(text).not.toContain("LOCATION:");
    expect(text).not.toContain("DESCRIPTION:");
    expect(text).not.toContain("URL:");
  });
});
