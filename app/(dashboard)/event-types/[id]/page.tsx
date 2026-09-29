import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Card } from "@/components/ui/primitives";
import { LOCKABLE_LABELS, type LockableField } from "@/features/teams/schemas";
import { managedParentOf } from "@/features/teams/server/event-types";
import { getDb } from "@/db/client";
import { EventTypeFormView } from "@/features/event-types/components/event-type-form";
import { saveEventTypeAction } from "@/features/event-types/server/actions";
import { eventTypeToForm } from "@/features/event-types/form-input";
import { PrivateLinksPanel } from "@/features/event-types/components/private-links-panel";
import { listPrivateLinks } from "@/features/event-types/server/private-links";
import { getEventType } from "@/features/event-types/server/service";
import { WorkflowsPanel } from "@/features/workflows/components/workflows-panel";
import { listWorkflows } from "@/features/workflows/server/service";
import { requestTime } from "@/lib/clock";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { getEventTypeCalendars, listConnections } from "@/features/calendars/server/connections";
import { listSchedules } from "@/features/schedules/server/service";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Edit event type" };

async function calendarProps(userId: string) {
  const connections = await listConnections(getDb(), userId);
  return {
    calendars: connections.flatMap((c) => c.calendars.map((cal) => ({ id: cal.id, name: cal.name, account: c.label, readOnly: cal.readOnly }))),
    connectedProviders: connections.filter((c) => !c.invalid).map((c) => c.provider),
  };
}

export default async function EditEventTypePage({ params }: PageProps<"/event-types/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const db = getDb();
  const [et, schedules, calendars] = await Promise.all([getEventType(db, user.id, id), listSchedules(db, user.id), calendarProps(user.id)]);
  if (!et) notFound();
  const [calendarSettings, workflows, links, parent] = await Promise.all([
    getEventTypeCalendars(db, id),
    listWorkflows(db, user.id, id),
    listPrivateLinks(db, cipherFromEnv(getEnv()), user.id, id),
    et.parentId ? managedParentOf(db, et.parentId) : null,
  ]);
  const now = requestTime();
  const profileUrl = `${getEnv().APP_URL}/${user.username ?? "username"}`;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/event-types" className="text-sm text-muted underline-offset-4 hover:underline">
            ← Event types
          </Link>
          <h1 className="text-2xl font-semibold">{et.title}</h1>
        </div>
        {user.username && (
          <a href={`${profileUrl}/${et.slug}`} className="text-sm font-medium underline-offset-4 hover:underline">
            Open booking page ↗
          </a>
        )}
      </div>
      {parent && (
        <Alert>
          Managed by the team <strong>{parent.teamName}</strong>. The URL
          {parent.lockedFields.length ? ` and these settings follow the team: ${parent.lockedFields.map((f) => LOCKABLE_LABELS[f as LockableField] ?? f).join(", ")}` : " follows the team"}. Changes to them here are ignored.
        </Alert>
      )}
      <Card>
        <EventTypeFormView
          initial={eventTypeToForm(et)}
          schedules={schedules}
          profileUrl={profileUrl}
          isNew={false}
          {...calendars}
          calendarSettings={calendarSettings}
          action={saveEventTypeAction.bind(null, id)}
        />
      </Card>
      <Card>
        <WorkflowsPanel scope={{ kind: "event_type", id }} workflows={workflows.map(({ id: wid, name, trigger, offsetMinutes, recipient, address, subject, body, enabled, isDefault }) => ({ id: wid, name, trigger, offsetMinutes, recipient, address, subject, body, enabled, isDefault }))} />
      </Card>
      <Card>
        <PrivateLinksPanel
          eventTypeId={id}
          linkOnly={et.linkOnly}
          links={links.map((l) => ({
            id: l.id,
            url: `${profileUrl}/${et.slug}?link=${encodeURIComponent(l.token)}`,
            status: l.usedAt ? "used" : l.expiresAt && l.expiresAt.getTime() < now ? "expired" : "active",
            expires: l.expiresAt ? l.expiresAt.toISOString().slice(0, 10) : null,
          }))}
        />
      </Card>
    </div>
  );
}
