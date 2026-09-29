import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HEADER_BUTTON_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LOCKABLE_LABELS, type LockableField } from "@/features/teams/schemas";
import { managedParentOf } from "@/features/teams/server/event-types";
import { getDb } from "@/db/client";
import { EmbedButton } from "@/features/embed/components/embed-dialog";
import { eventTypeTarget } from "@/features/embed/targets";
import { EventTypeFormView } from "@/features/event-types/components/event-type-form";
import { saveEventTypeAction } from "@/features/event-types/server/actions";
import { eventTypeToForm } from "@/features/event-types/form-input";
import { PrivateLinksPanel } from "@/features/event-types/components/private-links-panel";
import { listPrivateLinks } from "@/features/event-types/server/private-links";
import { durationsOf, getEventType } from "@/features/event-types/server/service";
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
    calendars: connections.flatMap((c) =>
      c.calendars.map((cal) => ({ id: cal.id, name: cal.name, account: c.label, readOnly: cal.readOnly })),
    ),
    connectedProviders: connections.filter((c) => !c.invalid).map((c) => c.provider),
  };
}

export default async function EditEventTypePage({ params }: PageProps<"/event-types/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const db = getDb();
  const [et, schedules, calendars] = await Promise.all([
    getEventType(db, user.id, id),
    listSchedules(db, user.id),
    calendarProps(user.id),
  ]);
  if (!et) notFound();
  const [calendarSettings, workflows, links, parent] = await Promise.all([
    getEventTypeCalendars(db, id),
    listWorkflows(db, user.id, id),
    listPrivateLinks(db, cipherFromEnv(getEnv()), user.id, id),
    et.parentId ? managedParentOf(db, et.parentId) : null,
  ]);
  const now = requestTime();
  const appUrl = getEnv().APP_URL;
  const profileUrl = `${appUrl}/${user.username ?? "username"}`;
  const embed = eventTypeTarget(user.username, { slug: et.slug, title: et.title, durations: durationsOf(et) });

  return (
    <div className={PAGE_CLASS}>
      <div className="flex flex-col gap-2">
        <Link href="/event-types" className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Event types
        </Link>
        <PageHeader
          title={et.title}
          description={user.username ? `${profileUrl.replace(/^https?:\/\//, "")}/${et.slug}` : undefined}
          actions={
            user.username && (
              <>
                {embed && <EmbedButton target={embed} appUrl={appUrl} className={`${HEADER_BUTTON_CLASS} bg-card`} />}
                <Button asChild variant="outline" className={`${HEADER_BUTTON_CLASS} bg-card`}>
                  <a href={`${profileUrl}/${et.slug}`}>Open booking page ↗</a>
                </Button>
              </>
            )
          }
        />
      </div>
      <div className="flex max-w-3xl flex-col gap-6">
        {parent && (
          <Alert>
            <AlertDescription>
              <p>
                Managed by the team <strong>{parent.teamName}</strong>. The URL
                {parent.lockedFields.length
                  ? ` and these settings follow the team: ${parent.lockedFields.map((f) => LOCKABLE_LABELS[f as LockableField] ?? f).join(", ")}`
                  : " follows the team"}
                . Changes to them here are ignored.
              </p>
            </AlertDescription>
          </Alert>
        )}
        <Card>
          <CardContent>
            <EventTypeFormView
              initial={eventTypeToForm(et)}
              schedules={schedules}
              profileUrl={profileUrl}
              isNew={false}
              {...calendars}
              calendarSettings={calendarSettings}
              action={saveEventTypeAction.bind(null, id)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <WorkflowsPanel
              scope={{ kind: "event_type", id }}
              workflows={workflows.map(
                ({ id: wid, name, trigger, offsetMinutes, recipient, address, subject, body, enabled, isDefault }) => ({
                  id: wid,
                  name,
                  trigger,
                  offsetMinutes,
                  recipient,
                  address,
                  subject,
                  body,
                  enabled,
                  isDefault,
                }),
              )}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
