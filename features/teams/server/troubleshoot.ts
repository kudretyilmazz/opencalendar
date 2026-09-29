import type { Database } from "@/db/client";
import { atLeast } from "../roles";
import { listTeamEventTypes, type TeamEventTypeView } from "./event-types";
import { listMyTeams } from "./service";

/**
 * AVL-008 for teams: the collective and round-robin event types a user may troubleshoot — those
 * of teams where they are admin or owner — with each type's hosts.
 */
export async function troubleshootableTeamEventTypes(db: Database, userId: string): Promise<(TeamEventTypeView & { teamName: string })[]> {
  const teams = (await listMyTeams(db, userId)).filter((t) => atLeast(t.role, "admin"));
  const perTeam = await Promise.all(
    teams.map(async (t) => (await listTeamEventTypes(db, userId, t.id)).filter((et) => et.schedulingType !== "managed").map((et) => ({ ...et, teamName: t.name }))),
  );
  return perTeam.flat();
}
