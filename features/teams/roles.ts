/** Team roles (TEAM-003), shared by client and server code. */
export const TEAM_ROLES = ["owner", "admin", "member"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

const RANK: Record<TeamRole, number> = { member: 0, admin: 1, owner: 2 };

export const atLeast = (role: TeamRole, min: TeamRole): boolean => RANK[role] >= RANK[min];
