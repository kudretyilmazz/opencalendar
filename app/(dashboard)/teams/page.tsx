import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { InvitationsList } from "@/features/teams/components/invitations-list";
import { TeamForm } from "@/features/teams/components/team-form";
import { createTeamAction } from "@/features/teams/server/actions";
import { listMyInvitations, listMyTeams } from "@/features/teams/server/service";
import { requireUser } from "@/lib/auth/session";
import { requestTime } from "@/lib/clock";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Teams" };

/** Teams the user belongs to, invitations for them, and a new-team form (TEAM-001/002). */
export default async function TeamsPage() {
  const user = await requireUser();
  const db = getDb();
  const [teams, invitations] = await Promise.all([
    listMyTeams(db, user.id),
    listMyInvitations(db, { id: user.id, email: user.email, emailVerified: user.emailVerified }, requestTime()),
  ]);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Teams</h1>
        <p className="text-sm text-muted">Schedule together: collective and round-robin event types, shared workflows and routing forms.</p>
      </div>
      <InvitationsList invitations={invitations.map((i) => ({ id: i.id, teamName: i.teamName, role: i.role }))} />
      {teams.length === 0 ? (
        <Card className="text-sm text-muted">You’re not in a team yet.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {teams.map((t) => (
            <li key={t.id}>
              <Card className="flex items-center justify-between gap-3 p-4">
                <div>
                  <Link href={`/teams/${t.id}`} className="font-medium underline-offset-4 hover:underline">
                    {t.name}
                  </Link>
                  <p className="text-sm text-muted">
                    /team/{t.slug} · {t.role}
                  </p>
                </div>
                <Link href={`/teams/${t.id}/availability`} className="text-sm font-medium underline-offset-4 hover:underline">
                  Availability
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Card className="flex flex-col gap-4">
        <h2 className="font-medium">Create a team</h2>
        <TeamForm action={createTeamAction} appUrl={getEnv().APP_URL} submitLabel="Create team" />
      </Card>
    </div>
  );
}
