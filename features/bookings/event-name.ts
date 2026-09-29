/** Booking titles (EVT-017): the host's template, or "<event> between <host> and <attendee>". */
export function bookingTitle(
  template: string | null,
  values: { event: string; host: string; attendee: string; location: string | null },
): string {
  if (!template) return `${values.event} between ${values.host} and ${values.attendee}`;
  const map: Record<string, string> = { event: values.event, host: values.host, attendee: values.attendee, location: values.location ?? "" };
  const title = template.replace(/\{(event|host|attendee|location)\}/g, (_, key: string) => map[key]).replace(/\s+/g, " ").trim();
  return (title || values.event).slice(0, 300);
}
