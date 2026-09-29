import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { EventTypeFormView } from "@/features/event-types/components/event-type-form";
import { DEFAULT_EVENT_TYPE } from "@/features/event-types/schemas";
import { atLeast } from "@/features/teams/roles";
import { SCHEDULING_LABELS, SCHEDULING_TYPES, type SchedulingType } from "@/features/teams/schemas";
import { createTeamEventTypeAction } from "@/features/teams/server/actions";
import { orNotFound } from "@/features/teams/server/load";
import { getTeam } from "@/features/teams/server/service";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "New team event type" };

export default async function NewTeamEventTypePage({ params, searchParams }: PageProps<"/teams/[id]/event-types/new">) {
  const { id } = await params;
  const { type } = await searchParams;
  const user = await requireUser();
  const team = await orNotFound(getTeam(getDb(), user.id, id));
  const kind = SCHEDULING_TYPES.find((t) => t === type) as SchedulingType | undefined;
  if (!kind || !atLeast(team.role, "admin")) notFound();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/teams/${id}`} className="text-sm text-muted underline-offset-4 hover:underline">
          ← {team.name}
        </Link>
        <h1 className="text-2xl font-semibold">New team event type</h1>
        <p className="text-sm text-muted">{SCHEDULING_LABELS[kind]}. You choose the hosts after saving.</p>
      </div>
      <Card>
        <EventTypeFormView
          initial={DEFAULT_EVENT_TYPE}
          schedules={[]}
          profileUrl={`${getEnv().APP_URL}/team/${team.slug}`}
          isNew
          calendars={[]}
          connectedProviders={[]}
          calendarSettings={{ conflictCalendarIds: [], destinationCalendarId: null }}
          action={createTeamEventTypeAction.bind(null, id, kind)}
          team
        />
      </Card>
    </div>
  );
}
