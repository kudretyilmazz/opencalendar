import type { Metadata } from "next";
import Link from "next/link";
import { PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { EventTypeFormView } from "@/features/event-types/components/event-type-form";
import { DEFAULT_EVENT_TYPE } from "@/features/event-types/schemas";
import { createEventTypeAction } from "@/features/event-types/server/actions";
import { listConnections } from "@/features/calendars/server/connections";
import { ensureDefaultSchedule, listSchedules } from "@/features/schedules/server/service";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "New event type" };

async function calendarProps(userId: string) {
  const connections = await listConnections(getDb(), userId);
  return {
    calendars: connections.flatMap((c) =>
      c.calendars.map((cal) => ({ id: cal.id, name: cal.name, account: c.label, readOnly: cal.readOnly })),
    ),
    connectedProviders: connections.filter((c) => !c.invalid).map((c) => c.provider),
  };
}

export default async function NewEventTypePage() {
  const user = await requireUser();
  const db = getDb();
  await ensureDefaultSchedule(db, user.id, user.timeZone ?? "UTC");
  const [schedules, calendars] = await Promise.all([listSchedules(db, user.id), calendarProps(user.id)]);
  return (
    <div className={PAGE_CLASS}>
      <div className="flex flex-col gap-2">
        <Link href="/event-types" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Event types
        </Link>
        <PageHeader title="New event type" description="A meeting people can book, like a 30-minute intro call." />
      </div>
      <Card className="max-w-3xl">
        <CardContent>
          <EventTypeFormView
            initial={DEFAULT_EVENT_TYPE}
            schedules={schedules}
            profileUrl={`${getEnv().APP_URL}/${user.username ?? "username"}`}
            isNew
            {...calendars}
            calendarSettings={{ conflictCalendarIds: [], destinationCalendarId: null }}
            action={createEventTypeAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
