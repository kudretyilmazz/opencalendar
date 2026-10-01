import type { Metadata } from "next";
import { ArrowLeft, CalendarRange, ExternalLink } from "lucide-react";
import Link from "next/link";
import { HEADER_BUTTON_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { EmbedButton } from "@/features/embed/components/embed-dialog";
import { teamEventTypeTarget, teamTarget } from "@/features/embed/targets";
import { durationsOf } from "@/features/event-types/server/service";
import { MembersPanel } from "@/features/teams/components/members-panel";
import { PayloadForm } from "@/features/teams/components/payload-form";
import { SectionCard } from "@/features/teams/components/section-card";
import { RolePill, SMALL_BUTTON_CLASS, TeamLogo } from "@/features/teams/components/team-cards";
import { TeamForm } from "@/features/teams/components/team-form";
import { atLeast } from "@/features/teams/roles";
import { SCHEDULING_LABELS, SCHEDULING_TYPES } from "@/features/teams/schemas";
import {
  cancelInvitationAction,
  changeRoleAction,
  deleteTeamAction,
  inviteMemberAction,
  removeMemberAction,
  toggleTeamEventTypeAction,
  updateTeamAction,
} from "@/features/teams/server/actions";
import { listTeamEventTypes } from "@/features/teams/server/event-types";
import { orNotFound } from "@/features/teams/server/load";
import { getTeam, listInvitations, listMembers } from "@/features/teams/server/service";
import { TeamWebhooksPanel } from "@/features/webhooks/components/team-webhooks-panel";
import { WorkflowsPanel } from "@/features/workflows/components/workflows-panel";
import { listTeamWorkflows } from "@/features/workflows/server/service";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Team" };

/** Team home (TEAM-001…008, NTF-007). What's shown follows the role; the server re-checks everything. */
export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const db = getDb();
  const team = await orNotFound(getTeam(db, user.id, id));
  const admin = atLeast(team.role, "admin");
  const [members, eventTypes, invitations, workflows] = await Promise.all([
    listMembers(db, user.id, id),
    listTeamEventTypes(db, user.id, id),
    admin ? listInvitations(db, user.id, id) : [],
    admin ? listTeamWorkflows(db, user.id, id) : [],
  ]);
  const appUrl = getEnv().APP_URL;
  const teamEmbed = teamTarget({ slug: team.slug, name: team.name });
  const embeds = new Map(
    eventTypes.map((et) => [
      et.id,
      teamEventTypeTarget(team.slug, {
        slug: et.slug,
        title: et.title,
        durations: durationsOf(et),
        schedulingType: et.schedulingType,
      }),
    ]),
  );

  return (
    <div className={PAGE_CLASS}>
      <div className="flex flex-col gap-3">
        <Link
          href="/teams"
          className="flex min-h-11 w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground md:min-h-0"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Teams
        </Link>
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <TeamLogo name={team.name} logoUrl={team.logoUrl} />
              <span className="min-w-0 break-words">{team.name}</span>
            </span>
          }
          description={
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs">/team/{team.slug}</span>
              <span aria-hidden>·</span>
              <span>Your role:</span>
              <RolePill role={team.role} />
            </span>
          }
          actions={
            <>
              <Button asChild variant="outline" className={`${HEADER_BUTTON_CLASS} bg-card`}>
                <Link href={`/teams/${id}/availability`}>
                  <CalendarRange aria-hidden />
                  Team availability
                </Link>
              </Button>
              {teamEmbed && (
                <EmbedButton
                  target={teamEmbed}
                  appUrl={appUrl}
                  aria-label="Embed team page"
                  className={`${HEADER_BUTTON_CLASS} bg-card`}
                />
              )}
              <Button asChild variant="outline" className={`${HEADER_BUTTON_CLASS} bg-card`}>
                <a href={`${appUrl}/team/${team.slug}`}>
                  <ExternalLink aria-hidden />
                  Public page
                </a>
              </Button>
            </>
          }
        />
      </div>

      <SectionCard title="Event types" description="Round-robin, collective and managed event types this team shares.">
        {eventTypes.length === 0 && <p className="text-sm text-muted-foreground">No team event types yet.</p>}
        {eventTypes.length > 0 && (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {eventTypes.map((et) => (
              <li key={et.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div
                  className={et.enabled ? "flex min-w-0 flex-col gap-0.5" : "flex min-w-0 flex-col gap-0.5 opacity-60"}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    {admin ? (
                      <Link href={`/teams/${id}/event-types/${et.id}`} className="font-medium hover:underline">
                        {et.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{et.title}</span>
                    )}
                    <Badge variant="muted">{SCHEDULING_LABELS[et.schedulingType!].split(" —")[0]}</Badge>
                    {!et.enabled && <Badge variant="outline">Off</Badge>}
                    {et.schedulingType !== "managed" && et.hosts.length === 0 && (
                      // Without hosts the booking page shows no times at all.
                      <Badge variant="danger">No hosts · no times offered</Badge>
                    )}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {et.assignAllTeamMembers ? "All team members" : `${et.hosts.length} host${et.hosts.length === 1 ? "" : "s"}`}
                    {et.schedulingType !== "managed" && (
                      <>
                        {" · "}
                        <span className="font-mono text-xs">
                          /team/{team.slug}/{et.slug}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {embeds.get(et.id) && (
                    <EmbedButton
                      target={embeds.get(et.id)!}
                      appUrl={appUrl}
                      aria-label={`Embed ${et.title}`}
                      className={`${SMALL_BUTTON_CLASS} bg-card`}
                    />
                  )}
                  {admin && (
                    <form action={toggleTeamEventTypeAction.bind(null, id, et.id, !et.enabled)}>
                      <Button variant="outline" className={`${SMALL_BUTTON_CLASS} bg-card`}>
                        {et.enabled ? "Turn off" : "Turn on"}
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {admin && (
          <div className="flex flex-wrap gap-2">
            {SCHEDULING_TYPES.map((t) => (
              <Button key={t} asChild variant="outline" className={`${SMALL_BUTTON_CLASS} bg-card`}>
                <Link href={`/teams/${id}/event-types/new?type=${t}`}>
                  New {SCHEDULING_LABELS[t].split(" —")[0].toLowerCase()}
                </Link>
              </Button>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard id="members">
        <MembersPanel
          members={members}
          invitations={invitations.map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            expires: i.expiresAt.toISOString().slice(0, 10),
          }))}
          selfId={user.id}
          canManage={admin}
          actions={{
            changeRole: changeRoleAction.bind(null, id),
            remove: removeMemberAction.bind(null, id),
            invite: inviteMemberAction.bind(null, id),
            cancelInvitation: cancelInvitationAction.bind(null, id),
          }}
        />
      </SectionCard>

      {admin && (
        <SectionCard>
          <WorkflowsPanel
            scope={{ kind: "team", id }}
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
        </SectionCard>
      )}

      {admin && (
        <SectionCard>
          <TeamWebhooksPanel teamId={id} userId={user.id} />
        </SectionCard>
      )}

      {admin && (
        <SectionCard title="Settings" description="Name, public URL, logo and brand color.">
          <TeamForm
            initial={{
              name: team.name,
              slug: team.slug,
              logoUrl: team.logoUrl ?? "",
              brandColor: team.brandColor ?? "",
            }}
            action={updateTeamAction.bind(null, id)}
            appUrl={appUrl}
            submitLabel="Save team"
          />
        </SectionCard>
      )}

      {team.role === "owner" && (
        <SectionCard
          title="Delete team"
          description="Deletes the team, its event types and routing forms. Not possible while there are upcoming bookings."
          className="border-destructive-border"
        >
          <PayloadForm
            action={deleteTeamAction.bind(null, id)}
            payload={{}}
            submitLabel="Delete team"
            variant="destructive"
            confirm={{
              title: `Delete ${team.name}?`,
              description: "The team, its event types and routing forms are removed. This can't be undone.",
              action: "Delete team",
            }}
          />
        </SectionCard>
      )}
    </div>
  );
}
