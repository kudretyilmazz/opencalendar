import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { membership } from "@/db/schema";
import { atLeast, type TeamRole } from "../roles";

/**
 * Team authorization (TEAM-003). Every team resource goes through `requireTeamRole` on the
 * server; the UI hiding a button is never the check. Non-members get NOT_FOUND (a team's
 * private resources don't reveal that they exist), members below the needed role FORBIDDEN.
 */

export { atLeast, TEAM_ROLES, type TeamRole } from "../roles";

export type TeamErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "SLUG_TAKEN"
  | "LAST_OWNER"
  | "ALREADY_MEMBER"
  | "INVITATION_NOT_FOUND"
  | "MEMBER_NOT_FOUND"
  | "NOT_A_HOST"
  | "EMAIL_NOT_VERIFIED"
  | "RATE_LIMITED";

export class TeamError extends Error {
  constructor(
    public readonly code: TeamErrorCode,
    public readonly detail?: string,
  ) {
    super(code);
    this.name = "TeamError";
  }
}

export async function roleIn(db: DbOrTx, userId: string, teamId: string): Promise<TeamRole | null> {
  const [row] = await db
    .select({ role: membership.role })
    .from(membership)
    .where(and(eq(membership.teamId, teamId), eq(membership.userId, userId)));
  return row?.role ?? null;
}

/** The caller's role, or throws NOT_FOUND (not a member) / FORBIDDEN (role too low). */
export async function requireTeamRole(db: DbOrTx, userId: string, teamId: string, min: TeamRole): Promise<TeamRole> {
  const role = await roleIn(db, userId, teamId);
  if (!role) throw new TeamError("NOT_FOUND");
  if (!atLeast(role, min)) throw new TeamError("FORBIDDEN");
  return role;
}
