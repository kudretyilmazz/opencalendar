import { getDb } from "@/db/client";
import { slotsQuerySchema } from "@/features/bookings/schemas";
import { BookingFailure, findBookingForManage, getAvailableSlots, getTeamSlots } from "@/features/bookings/server/service";
import { cachedExternalBusyFor } from "@/features/calendars/server/runtime";
import { publicBookingContext } from "@/features/bookings/server/public-context";
import { isUsablePrivateLink } from "@/features/event-types/server/private-links";
import { slotLatency } from "@/lib/metrics";
import { clientIp, overLocalLimit } from "@/lib/security/public-limits";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Slots for one visible month of the public booking page (BKG-002). No explanations leak here.
 * GET takes plain query params; the booking widget uses POST so a reschedule's manage token
 * travels in the body, never in URLs or access logs.
 */
async function handle(request: Request, input: unknown) {
  const started = performance.now();
  try {
    return await compute(request, input);
  } finally {
    slotLatency().observe((performance.now() - started) / 1000);
  }
}

async function compute(request: Request, input: unknown) {
  if (overLocalLimit("slots", clientIp(request.headers))) return json({ error: "Too many requests" }, 429);
  const parsed = slotsQuerySchema.safeParse(input);
  if (!parsed.success) return json({ error: "Invalid query" }, 400);
  const q = parsed.data;
  const db = getDb();
  const context = await publicBookingContext({ username: q.username, team: q.team, slug: q.slug });
  if (!context) return json({ error: "Not found" }, 404);
  const { target, host, eventType, schedule } = context;
  // The booking being moved only stops counting as busy for someone holding its manage token.
  let rescheduleUid: string | undefined;
  if (q.reschedule && q.token) {
    const manage = await findBookingForManage(db, q.reschedule, q.token);
    if (manage?.canManage && manage.booking.eventTypeId === eventType.id) rescheduleUid = q.reschedule;
  }
  // Link-only event types answer only for holders of a usable single-use link (EVT-015) or of
  // a booking they are moving.
  if (eventType.linkOnly && !rescheduleUid && !(await isUsablePrivateLink(db, eventType.id, q.link, Date.now()))) {
    return json({ error: "Not found" }, 404);
  }
  try {
    const request = { eventType, durationMin: q.duration, window: { start: q.start, end: q.end }, now: Date.now(), rescheduleUid, ownHoldToken: q.hold, displayCache: true };
    const slots = target.hosts
      ? await getTeamSlots(db, { ...request, hosts: target.hosts, externalBusyFor: (hostId) => cachedExternalBusyFor(target.hosts!.find((h) => h.host.id === hostId)!.host, eventType.id) })
      : await getAvailableSlots(db, { ...request, host, externalBusy: cachedExternalBusyFor(host, eventType.id), schedule });
    return json({ slots: slots.map((s) => ({ start: s.start, end: s.end, ...(s.seatsRemaining !== undefined && { seats: s.seatsRemaining }) })) });
  } catch (error) {
    if (error instanceof BookingFailure) return json({ error: error.code }, 400);
    throw error;
  }
}

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { token: _token, ...withoutToken } = params; // tokens in URLs are not accepted
  return handle(request, withoutToken);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid body" }, 400);
  }
  return handle(request, body);
}
