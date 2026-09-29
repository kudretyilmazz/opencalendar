import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HEADER_BUTTON_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { weekWindow } from "@/features/dashboard/overview";
import { CreateTeamCard } from "@/features/teams/components/create-team-card";
import { InvitationsList } from "@/features/teams/components/invitations-list";
import { MembersTable } from "@/features/teams/components/members-table";
import { TeamCardView } from "@/features/teams/components/team-cards";
import { firstManagedTeam, todayWindow } from "@/features/teams/overview";
import { createTeamAction } from "@/features/teams/server/actions";
import { loadMemberActivity, loadTeamCards } from "@/features/teams/server/overview";
import { listMyInvitations } from "@/features/teams/server/service";
import { isValidTimeZone } from "@/lib/availability/tz";
import { requireUser } from "@/lib/auth/session";
import { requestTime } from "@/lib/clock";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Teams" };

/** Teams the user belongs to, invitations for them, and a new-team form (TEAM-001/002). */
export default async function TeamsPage() {
  const user = await requireUser();
  const db = getDb();
  const now = requestTime();
  const timeZone = user.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : "UTC";
  const week = weekWindow(now, timeZone, user.weekStart ?? 1);
  const [teams, invitations] = await Promise.all([
    loadTeamCards(db, user.id, week),
    listMyInvitations(db, { id: user.id, email: user.email, emailVerified: user.emailVerified }, now),
  ]);
  const managed = firstManagedTeam(teams);
  const members = managed
    ? await loadMemberActivity(db, user.id, managed.id, { today: todayWindow(now, timeZone), week })
    : [];

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Teams"
        description="Share round-robin and collective event types, and see everyone's availability together."
        actions={
          <Button asChild className={HEADER_BUTTON_CLASS}>
            <Link href="#create-team">
              <Plus aria-hidden />
              Create team
            </Link>
          </Button>
        }
      />
      <InvitationsList
        invitations={invitations.map((i) => ({ id: i.id, teamName: i.teamName, role: i.role, inviterName: i.inviterName }))}
      />
      {teams.length === 0 && <p className="text-sm text-muted-foreground">You’re not in a team yet.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((t) => (
          <TeamCardView key={t.id} team={t} />
        ))}
        <CreateTeamCard action={createTeamAction} appUrl={getEnv().APP_URL} />
      </div>
      {managed && <MembersTable teamId={managed.id} teamName={managed.name} members={members} />}
    </div>
  );
}
