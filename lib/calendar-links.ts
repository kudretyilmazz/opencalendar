export type CalendarLinkEvent = { title: string; start: number; end: number; details?: string; location?: string };

const compactUtc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(ev: CalendarLinkEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${compactUtc(ev.start)}/${compactUtc(ev.end)}`,
    ...(ev.details && { details: ev.details }),
    ...(ev.location && { location: ev.location }),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookCalendarUrl(ev: CalendarLinkEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: ev.title,
    startdt: new Date(ev.start).toISOString(),
    enddt: new Date(ev.end).toISOString(),
    ...(ev.details && { body: ev.details }),
    ...(ev.location && { location: ev.location }),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}
