import { formatDateLong, formatTime, type FormatPrefs } from "@/lib/format";

/**
 * Renders workflow templates (NTF-005). Output is plain text; the email template escapes it, so
 * booker-supplied values (names, answers) can't inject markup. Unknown placeholders stay as-is.
 */

export type TemplateContext = {
  eventName: string;
  hostName: string;
  attendeeName: string;
  attendeeEmail: string;
  start: number;
  end: number;
  location: string | null;
  bookingUrl: string;
  /** The recipient's own links: tokenized for the booker, the dashboard for hosts, "" otherwise. */
  cancelUrl: string;
  rescheduleUrl: string;
  answers: readonly { label: string; value: string }[];
};

export function renderTemplate(template: string, ctx: TemplateContext, prefs: FormatPrefs): string {
  const values: Record<string, string> = {
    event_name: ctx.eventName,
    host_name: ctx.hostName,
    attendee_name: ctx.attendeeName,
    attendee_email: ctx.attendeeEmail,
    date: formatDateLong(ctx.start, prefs),
    time: formatTime(ctx.start, prefs),
    end_time: formatTime(ctx.end, prefs),
    timezone: prefs.timeZone,
    location: ctx.location ?? "—",
    booking_url: ctx.bookingUrl,
    cancel_url: ctx.cancelUrl || "—",
    reschedule_url: ctx.rescheduleUrl || "—",
    answers: ctx.answers.map((a) => `${a.label}: ${a.value}`).join("\n") || "—",
  };
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => values[key] ?? match);
}

/** Subject lines are single-line: collapse whitespace so answers can't add headers or lines. */
export const renderSubject = (template: string, ctx: TemplateContext, prefs: FormatPrefs) =>
  renderTemplate(template, ctx, prefs).replace(/\s+/g, " ").trim().slice(0, 200);
