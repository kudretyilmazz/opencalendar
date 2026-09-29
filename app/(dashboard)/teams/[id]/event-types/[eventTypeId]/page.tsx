import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { EventTypeFormView } from "@/features/event-types/components/event-type-form";
import { eventTypeToForm } from "@/features/event-types/form-input";
import { HostsPanel } from "@/features/teams/components/hosts-panel";
import { ManagedPanel } from "@/features/teams/components/managed-panel";
import { PayloadForm } from "@/features/teams/components/payload-form";
import { LOCKABLE_FIELDS, type LockableField, SCHEDULING_LABELS } from "@/features/teams/schemas";
import { deleteTeamEventTypeAction, saveHostsAction, saveManagedAction, saveTeamEventTypeAction } from "@/features/teams/server/actions";
import { getTeamEventType } from "@/features/teams/server/event-types";
import { orNotFound } from "@/features/teams/server/load";
import { getTeam, listMembers } from "@/features/teams/server/service";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Edit team event type" };

/** A team event type: settings, then hosts (TEAM-004…007) or assignments and locks (TEAM-008). */
export default async function TeamEventTypePage({ params }: PageProps<"/teams/[id]/event-types/[eventTypeId]">) {
  const { id, eventTypeId } = await params;
  const user = await requireUser();
  const db = getDb();
  const team = await orNotFound(getTeam(db, user.id, id));
  const et = await orNotFound(getTeamEventType(db, user.id, id, eventTypeId));
  const members = (await listMembers(db, user.id, id)).map((m) => ({ userId: m.userId, name: m.name }));
  const teamUrl = `${getEnv().APP_URL}/team/${team.slug}`;
  const managed = et.schedulingType === "managed";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href={`/teams/${id}`} className="text-sm text-muted underline-offset-4 hover:underline">
            ← {team.name}
          </Link>
          <h1 className="text-2xl font-semibold">{et.title}</h1>
          <p className="text-sm text-muted">{SCHEDULING_LABELS[et.schedulingType!]}</p>
        </div>
        {!managed && (
          <a href={`${teamUrl}/${et.slug}`} className="text-sm font-medium underline-offset-4 hover:underline">
            Open booking page ↗
          </a>
        )}
      </div>
      <Card>
        {managed ? (
          <ManagedPanel
            members={members}
            assignees={et.hosts.map((h) => h.userId)}
            lockedFields={et.lockedFields.filter((f): f is LockableField => f in LOCKABLE_FIELDS)}
            action={saveManagedAction.bind(null, id, eventTypeId)}
          />
        ) : (
          <HostsPanel
            members={members}
            initial={et.hosts.map((h) => ({ userId: h.userId, isFixed: h.isFixed, weight: h.weight, priority: h.priority }))}
            windowDays={et.roundRobinWindowDays}
            roundRobin={et.schedulingType === "round_robin"}
            action={saveHostsAction.bind(null, id, eventTypeId)}
          />
        )}
      </Card>
      <Card>
        <EventTypeFormView
          initial={eventTypeToForm(et)}
          schedules={[]}
          profileUrl={teamUrl}
          isNew={false}
          calendars={[]}
          connectedProviders={[]}
          calendarSettings={{ conflictCalendarIds: [], destinationCalendarId: null }}
          action={saveTeamEventTypeAction.bind(null, id, eventTypeId)}
          team
        />
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Delete</h2>
        <p className="text-sm text-muted">Not possible while it{managed ? " or a member copy" : ""} has upcoming bookings.</p>
        <PayloadForm action={deleteTeamEventTypeAction.bind(null, id, eventTypeId)} payload={{}} submitLabel="Delete event type" variant="secondary" />
      </Card>
    </div>
  );
}
