import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { HEADER_BUTTON_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { CopyButton } from "@/features/dashboard/components/copy-button";
import { BookingPageStrip } from "@/features/event-types/components/booking-page-strip";
import { eventTypeTarget, profileTarget } from "@/features/embed/targets";
import { EventTypeList } from "@/features/event-types/components/event-type-list";
import { TeamEventTypes } from "@/features/event-types/components/team-event-types";
import {
  durationLabel,
  type EventTypeListRow,
  locationLabel,
  rowBadges,
  statusOf,
  weekSummary,
} from "@/features/event-types/list-view";
import { countWeekBookings, listMyTeamEventTypes } from "@/features/event-types/server/list";
import { durationsOf, type EventTypeView, listEventTypes } from "@/features/event-types/server/service";
import { getProfile } from "@/features/settings/server/service";
import { requireUser } from "@/lib/auth/session";
import { requestTime } from "@/lib/clock";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Event types" };

function toRow(
  et: EventTypeView,
  weekCounts: Record<string, number>,
  pageUrl: string | null,
  username: string | null,
): EventTypeListRow {
  const status = statusOf(et);
  return {
    id: et.id,
    title: et.title,
    slug: et.slug,
    status,
    durations: durationLabel(durationsOf(et)),
    location: locationLabel(et.locations),
    badges: rowBadges(et),
    week: weekSummary(status, weekCounts[et.id] ?? 0),
    url: pageUrl ? `${pageUrl}/${et.slug}` : null,
    embed: eventTypeTarget(username, { slug: et.slug, title: et.title, durations: durationsOf(et) }),
  };
}

export default async function EventTypesPage({ searchParams }: PageProps<"/event-types">) {
  const user = await requireUser();
  const { error } = await searchParams;
  const db = getDb();
  const profile = await getProfile(db, user.id);
  const timeZone = profile?.timeZone ?? "UTC";
  const weekStart = profile?.weekStart ?? 1;
  const [eventTypes, weekCounts, teamTypes] = await Promise.all([
    listEventTypes(db, user.id),
    countWeekBookings(db, user.id, { now: requestTime(), timeZone, weekStart }),
    listMyTeamEventTypes(db, user.id),
  ]);

  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  const username = profile?.username ?? user.username ?? null;
  const pageUrl = username ? `${appUrl}/${username}` : null;
  const rows = eventTypes.map((et) => toRow(et, weekCounts, pageUrl, username));
  const publicCount = rows.filter((r) => r.status === "active").length;
  const hiddenCount = rows.filter((r) => r.status === "hidden").length;

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Event types"
        description="Meetings people can book from your page."
        actions={
          <>
            {pageUrl && (
              <CopyButton value={pageUrl} variant="outline" className={`${HEADER_BUTTON_CLASS} bg-card`}>
                Copy page link
              </CopyButton>
            )}
            <Button asChild className={HEADER_BUTTON_CLASS}>
              <Link href="/event-types/new">
                <Plus aria-hidden />
                New event type
              </Link>
            </Button>
          </>
        }
      />
      {typeof error === "string" && (
        <Alert variant="destructive">
          <AlertDescription>{error.slice(0, 200)}</AlertDescription>
        </Alert>
      )}
      {!user.emailVerified && (
        <Alert variant="destructive">
          <AlertDescription>Verify your email address to publish your booking page.</AlertDescription>
        </Alert>
      )}
      <BookingPageStrip
        name={profile?.name ?? user.name}
        url={pageUrl}
        display={pageUrl ? pageUrl.replace(/^https?:\/\//, "") : ""}
        publicCount={publicCount}
        hiddenCount={hiddenCount}
        embed={profileTarget(username, profile?.name ?? user.name)}
        appUrl={appUrl}
      />
      {rows.length === 0 ? (
        <Card className="items-start gap-3 px-5 py-6">
          <p className="text-sm text-muted-foreground">
            No event types yet. Create your first one to start taking bookings.
          </p>
          <Button asChild variant="outline" className="h-10 rounded-md bg-transparent px-3.5 text-sm">
            <Link href="/event-types/new">Create an event type</Link>
          </Button>
        </Card>
      ) : (
        <EventTypeList rows={rows} appUrl={appUrl} />
      )}
      <TeamEventTypes items={teamTypes} />
    </div>
  );
}
