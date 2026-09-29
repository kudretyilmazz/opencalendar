import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { MembersPanel } from "@/features/teams/components/members-panel";
import { PayloadForm } from "@/features/teams/components/payload-form";
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

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/teams" className="text-sm text-muted underline-offset-4 hover:underline">
            ← Teams
          </Link>
          <h1 className="text-2xl font-semibold">{team.name}</h1>
          <p className="text-sm text-muted">Your role: {team.role}</p>
        </div>
        <div className="flex gap-4 text-sm font-medium">
          <Link href={`/teams/${id}/availability`} className="underline-offset-4 hover:underline">
            Team availability
          </Link>
          <a href={`${appUrl}/team/${team.slug}`} className="underline-offset-4 hover:underline">
            Public page ↗
          </a>
        </div>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium">Event types</h2>
        {eventTypes.length === 0 && <p className="text-sm text-muted">No team event types yet.</p>}
        <ul className="flex flex-col gap-2">
          {eventTypes.map((et) => (
            <li key={et.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div className={et.enabled ? "" : "opacity-60"}>
                {admin ? (
                  <Link href={`/teams/${id}/event-types/${et.id}`} className="font-medium underline-offset-4 hover:underline">
                    {et.title}
                  </Link>
                ) : (
                  <span className="font-medium">{et.title}</span>
                )}
                <p className="text-muted">
                  {SCHEDULING_LABELS[et.schedulingType!].split(" —")[0]} · {et.hosts.length} host{et.hosts.length === 1 ? "" : "s"}
                  {et.schedulingType !== "managed" && ` · /team/${team.slug}/${et.slug}`}
                </p>
              </div>
              {admin && (
                <form action={toggleTeamEventTypeAction.bind(null, id, et.id, !et.enabled)}>
                  <Button variant="secondary" className="h-8">
                    {et.enabled ? "Turn off" : "Turn on"}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {admin && (
          <div className="flex flex-wrap gap-2">
            {SCHEDULING_TYPES.map((t) => (
              <Link key={t} href={`/teams/${id}/event-types/new?type=${t}`} className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-accent">
                New {SCHEDULING_LABELS[t].split(" —")[0].toLowerCase()}
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <MembersPanel
          members={members}
          invitations={invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expires: i.expiresAt.toISOString().slice(0, 10) }))}
          selfId={user.id}
          canManage={admin}
          actions={{
            changeRole: changeRoleAction.bind(null, id),
            remove: removeMemberAction.bind(null, id),
            invite: inviteMemberAction.bind(null, id),
            cancelInvitation: cancelInvitationAction.bind(null, id),
          }}
        />
      </Card>

      {admin && (
        <Card>
          <WorkflowsPanel
            scope={{ kind: "team", id }}
            workflows={workflows.map(({ id: wid, name, trigger, offsetMinutes, recipient, address, subject, body, enabled, isDefault }) => ({ id: wid, name, trigger, offsetMinutes, recipient, address, subject, body, enabled, isDefault }))}
          />
        </Card>
      )}

      {admin && (
        <Card>
          <TeamWebhooksPanel teamId={id} userId={user.id} />
        </Card>
      )}

      {admin && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-medium">Settings</h2>
          <TeamForm
            initial={{ name: team.name, slug: team.slug, logoUrl: team.logoUrl ?? "", brandColor: team.brandColor ?? "" }}
            action={updateTeamAction.bind(null, id)}
            appUrl={appUrl}
            submitLabel="Save team"
          />
        </Card>
      )}

      {team.role === "owner" && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium">Delete team</h2>
          <p className="text-sm text-muted">Deletes the team, its event types and routing forms. Not possible while there are upcoming bookings.</p>
          <PayloadForm action={deleteTeamAction.bind(null, id)} payload={{}} submitLabel="Delete team" variant="secondary" />
        </Card>
      )}
    </div>
  );
}
