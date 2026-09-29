import { getDb } from "@/db/client";
import { bookingIcs } from "@/features/bookings/server/notifications";
import { findBookingForManage } from "@/features/bookings/server/service";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** .ics download for the confirmation page (BKG-007). Participant details need the token. */
export async function GET(request: Request, ctx: RouteContext<"/api/bookings/[uid]/ics">) {
  const { uid } = await ctx.params;
  const token = new URL(request.url).searchParams.get("token");
  const found = await findBookingForManage(getDb(), uid, token);
  if (!found) return new Response("Not found", { status: 404 });
  const cancelled = found.booking.status === "cancelled" || found.booking.status === "rejected";
  // A seat token sees its own seat (and others only if the host allows it, EVT-012).
  const participant = found.canManage || found.seat !== null;
  const details = participant
    ? found
    : {
        ...found,
        attendees: [],
        booking: { ...found.booking, title: `${found.eventType.title} with ${found.host.name}`, notes: null, locationValue: null },
      };
  const ics = bookingIcs(details, cancelled ? "CANCEL" : "REQUEST", getEnv().APP_URL, Date.now(), {
    anonymous: !participant,
    viewer: found.seat ?? undefined,
  });
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="invite.ics"',
      "cache-control": "private, no-store",
    },
  });
}
