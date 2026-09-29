/**
 * Redirect after booking (EVT-016). Only https targets are allowed (validated when the host
 * saves them); booking details are appended as query parameters when the host opted in.
 * Nothing secret (manage tokens) is ever forwarded.
 */
export function bookingRedirectUrl(
  target: string,
  forward: boolean,
  booking: { uid: string; title: string; start: number; end: number; status: string; eventSlug: string; name: string; email: string },
): string | null {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (forward) {
    const params: Record<string, string> = {
      uid: booking.uid,
      title: booking.title,
      start: new Date(booking.start).toISOString(),
      end: new Date(booking.end).toISOString(),
      status: booking.status,
      type: booking.eventSlug,
      name: booking.name,
      email: booking.email,
    };
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return url.toString();
}
