import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { type Database, getDb } from "@/db/client";
import { user } from "@/db/schema";
import { BookingWidget } from "@/features/bookings/components/booking-widget";
import { publicLocationLabel } from "@/features/bookings/location";
import { prefillAnswers, utmFrom } from "@/features/bookings/responses";
import { findBookingForManage } from "@/features/bookings/server/service";
import type { BookingTarget } from "@/features/bookings/server/targets";
import { isUsablePrivateLink } from "@/features/event-types/server/private-links";
import { durationsOf } from "@/features/event-types/server/service";
import { brandStyle } from "@/features/instance/theme/brand-style";
import { cn } from "@/lib/cn";
import { requestTime } from "@/lib/clock";
import { parseBookingLinkParams } from "@/lib/embed/booking-link";
import { parseEmbedOptions } from "@/lib/embed/protocol";
import { getEnv } from "@/lib/env";

type Query = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The host's first day of the week (0 = Sunday) for the week layout. */
async function hostWeekStart(db: Database, userId: string): Promise<number | undefined> {
  const [row] = await db.select({ weekStart: user.weekStart }).from(user).where(eq(user.id, userId));
  return row?.weekStart;
}

/**
 * Public booking page body (BKG-002/003) for any target: a personal event type, a team event type
 * (TEAM-001) or a dynamic group (TEAM-009). `?reschedule=<uid>&token=<t>` books a new time
 * (BKG-009), `?link=<token>` is a single-use link (EVT-015), `?routing=<id>` links a routing-form
 * response (RTE-004), other parameters prefill the form (BKG-014), `?embed=1` renders the
 * compact embed variant (EMB-004), and the booking-link parameters `date`, `duration`, `slot` and
 * `layout` (features/embed/target.ts) pick the day, duration, time and calendar layout.
 */
export async function BookingPageView({ target, query }: { target: BookingTarget; query: Query }) {
  const db = getDb();
  const { eventType } = target;
  const reschedule = one(query.reschedule);
  const token = one(query.token);
  const link = one(query.link);

  let rescheduleProps;
  if (reschedule && token) {
    const manage = await findBookingForManage(db, reschedule, token);
    const primary = manage?.attendees.find((a) => !a.isGuest);
    const active = manage && ["accepted", "pending"].includes(manage.booking.status);
    const movable = !eventType.disableRescheduling && !manage?.booking.recurringSeriesId;
    if (manage?.canManage && active && movable && manage.booking.eventTypeId === eventType.id && primary) {
      rescheduleProps = { uid: reschedule, token, name: primary.name, email: primary.email, previousStart: manage.booking.startAt.getTime() };
    }
  }
  if (eventType.linkOnly && !rescheduleProps && !(await isUsablePrivateLink(db, eventType.id, link, requestTime()))) notFound();

  const embed = parseEmbedOptions(query);
  const linkParams = parseBookingLinkParams(query);
  const weekStart = await hostWeekStart(db, target.host.id);
  const routing = one(query.routing);
  const theme = embed?.theme === "dark" ? "dark" : embed?.theme === "light" ? "light" : undefined;
  const brandColor = embed?.brand ?? target.team?.brandColor ?? undefined;
  const brand = brandStyle(brandColor);

  return (
    <main className={cn("mx-auto flex w-full flex-1 flex-col", embed ? "max-w-5xl bg-background p-0 text-foreground" : "max-w-5xl px-3 py-3 sm:px-4 sm:py-10", theme)} style={brand}>
      {/* overflow-clip, not the card's overflow-hidden: it still rounds the corners but creates no
          scroll container, so the form's sticky confirm button sticks to the screen on phones. */}
      <Card className={cn("gap-0 overflow-clip py-0", embed ? "rounded-none border-0 shadow-none ring-0" : "shadow-sm")}>
        <BookingWidget
          title={eventType.title}
          hostName={target.displayName}
          description={eventType.description}
          durations={durationsOf(eventType)}
          seated={eventType.seatsPerSlot !== null}
          lockTimeZone={eventType.lockTimeZone}
          initialDuration={linkParams.duration}
          initialDate={linkParams.date}
          initialMonth={linkParams.month}
          initialSlot={linkParams.slot}
          initialLayout={linkParams.layout}
          weekStart={weekStart}
          hideDetails={embed?.hideDetails}
          form={{
            username: target.kind === "team" ? "" : target.basePath.slice(1),
            ...(target.team && { team: target.team.slug }),
            slug: eventType.slug,
            ...(routing && /^[A-Za-z0-9_-]{1,64}$/.test(routing) && { routing }),
            locations: eventType.locations.map((l) => ({ kind: l.kind, label: publicLocationLabel(l) })),
            maxGuests: eventType.seatsPerSlot ? 0 : eventType.maxGuests,
            questions: eventType.questions,
            recurring: eventType.recurringFrequency && eventType.recurringMaxCount ? { frequency: eventType.recurringFrequency, maxCount: eventType.recurringMaxCount } : null,
            requiresConfirmation: eventType.requiresConfirmation,
            reschedule: rescheduleProps,
            prefill: {
              name: one(query.name)?.slice(0, 100),
              email: one(query.email)?.slice(0, 254),
              notes: one(query.notes)?.slice(0, 2000),
              answers: prefillAnswers(eventType.questions, query),
            },
            utm: utmFrom(query),
            link: eventType.linkOnly ? link : undefined,
            embed: Boolean(embed),
            captcha: getEnv().CAPTCHA === "altcha",
          }}
        />
      </Card>
    </main>
  );
}
