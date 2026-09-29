import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
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
    calendars: connections.flatMap((c) => c.calendars.map((cal) => ({ id: cal.id, name: cal.name, account: c.label, readOnly: cal.readOnly }))),
    connectedProviders: connections.filter((c) => !c.invalid).map((c) => c.provider),
  };
}

export default async function NewEventTypePage() {
  const user = await requireUser();
  const db = getDb();
  await ensureDefaultSchedule(db, user.id, user.timeZone ?? "UTC");
  const [schedules, calendars] = await Promise.all([listSchedules(db, user.id), calendarProps(user.id)]);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/event-types" className="text-sm text-muted underline-offset-4 hover:underline">
          ← Event types
        </Link>
        <h1 className="text-2xl font-semibold">New event type</h1>
      </div>
      <Card>
        <EventTypeFormView
          initial={DEFAULT_EVENT_TYPE}
          schedules={schedules}
          profileUrl={`${getEnv().APP_URL}/${user.username ?? "username"}`}
          isNew
          {...calendars}
          calendarSettings={{ conflictCalendarIds: [], destinationCalendarId: null }}
          action={createEventTypeAction}
        />
      </Card>
    </div>
  );
}
