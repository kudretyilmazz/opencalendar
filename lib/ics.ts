/**
 * Minimal RFC 5545 writer for booking invitations (NTF-002/003). One VEVENT, UTC times,
 * CRLF line endings, 75-octet folding, and escaping of all user-controlled text.
 */

export type IcsPerson = { name: string; email: string };
/** PUBLISH is used for recurring series sent as several events in one file (EVT-013). */
export type IcsMethod = "REQUEST" | "CANCEL" | "PUBLISH";

export type IcsEvent = {
  uid: string;
  sequence: number;
  /** Omit for stored calendar objects (CalDAV resources must not carry METHOD). */
  method?: IcsMethod;
  start: number;
  end: number;
  stamp: number;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  organizer: IcsPerson;
  attendees: readonly IcsPerson[];
};

const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** TEXT value escaping (RFC 5545 §3.3.11). */
const text = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Parameter values: no control characters or quotes; quoted if they contain : ; , */
const param = (value: string) => {
  const clean = value.replace(/[\u0000-\u001f\u007f"]/g, "");
  return /[:;,]/.test(clean) ? `"${clean}"` : clean;
};

const mailto = (email: string) => `mailto:${email.replace(/[\u0000-\u001f\u007f\s]/g, "")}`;

/** Folds a content line at 75 octets without splitting UTF-8 sequences (RFC 5545 §3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

function vevent(event: IcsEvent): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${text(event.uid)}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${utc(event.stamp)}`,
    `DTSTART:${utc(event.start)}`,
    `DTEND:${utc(event.end)}`,
    `SUMMARY:${text(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${text(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${text(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url.replace(/[\u0000-\u001f\u007f\s]/g, "")}`] : []),
    `STATUS:${event.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `ORGANIZER;CN=${param(event.organizer.name)}:${mailto(event.organizer.email)}`,
    ...event.attendees.map(
      (a) => `ATTENDEE;CN=${param(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:${mailto(a.email)}`,
    ),
    "END:VEVENT",
  ];
}

/** One calendar file with one or more events (several only with METHOD:PUBLISH or none). */
export function buildIcsCalendar(events: readonly IcsEvent[], method?: IcsMethod): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OpenCalendar//EN",
    "CALSCALE:GREGORIAN",
    ...(method ? [`METHOD:${method}`] : []),
    ...events.flatMap((e) => vevent({ ...e, method })),
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function buildIcs(event: IcsEvent): string {
  return buildIcsCalendar([event], event.method);
}
