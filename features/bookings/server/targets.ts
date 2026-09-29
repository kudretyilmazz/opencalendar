import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { membership, profileSettings } from "@/db/schema";
import { type EventTypeView, findPublicEventType, findPublicHost, type PublicHost } from "@/features/event-types/server/service";
import { findPublicTeam, findPublicTeamEventType, type PublicTeam } from "@/features/teams/server/event-types";
import type { HostPlan } from "./create";

/**
 * What a public booking URL points at (BKG-002, TEAM-001, TEAM-009):
 * - `/{username}/{slug}` — a personal event type, one host;
 * - `/team/{team}/{slug}` — a team's collective or round-robin event type;
 * - `/{a}+{b}/{slug}` — a dynamic group: the first user's event type, booked collectively with
 *   everyone, each on their default schedule. Only people who share a team and have each opted
 *   in (profile setting) can be grouped, so the URL is no oracle for private team membership.
 */
export type BookingTarget = {
  kind: "user" | "team" | "group";
  eventType: EventTypeView;
  /** Personal: the host. Team/group: the first host (the organizer when nothing else decides). */
  host: PublicHost;
  /** Team and group targets only. */
  hosts?: HostPlan[];
  /** Shown as "with …" on the booking page and used in collective titles. */
  displayName: string;
  /** URL prefix of the target, e.g. "/ada", "/team/acme", "/ada+bob". */
  basePath: string;
  team?: PublicTeam;
};

export type TargetKey = { username?: string; team?: string; slug: string };

export const MAX_GROUP_SIZE = 5;

/** A path segment decoded, or "" when it's malformed (a 404, not a 500). */
export function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

/** Splits "ada+bob" into usernames; null when it isn't a valid group. */
export function groupUsernames(value: string): string[] | null {
  if (!value.includes("+")) return null;
  const names = value.toLowerCase().split("+").map((n) => n.trim());
  const unique = [...new Set(names)];
  if (unique.length !== names.length || unique.length < 2 || unique.length > MAX_GROUP_SIZE || unique.some((n) => !/^[a-z0-9-]{1,32}$/.test(n))) return null;
  return unique;
}

/** Everyone agreed to be booked in group links (profile setting, off by default). */
async function allOptedIn(db: Database, userIds: string[]): Promise<boolean> {
  const rows = await db
    .select({ userId: profileSettings.userId })
    .from(profileSettings)
    .where(and(inArray(profileSettings.userId, userIds), eq(profileSettings.allowDynamicGroup, true)));
  return rows.length === userIds.length;
}

/** Everyone shares at least one team (TEAM-009). */
async function shareATeam(db: Database, userIds: string[]): Promise<boolean> {
  const rows = await db.select({ teamId: membership.teamId, userId: membership.userId }).from(membership).where(inArray(membership.userId, userIds));
  const byTeam = new Map<string, Set<string>>();
  for (const r of rows) byTeam.set(r.teamId, (byTeam.get(r.teamId) ?? new Set()).add(r.userId));
  return [...byTeam.values()].some((members) => members.size === userIds.length);
}

async function resolveGroup(db: Database, usernames: string[], slug: string): Promise<BookingTarget | null> {
  const hosts = await Promise.all(usernames.map((u) => findPublicHost(db, u)));
  if (hosts.some((h) => !h)) return null;
  const people = hosts as PublicHost[];
  if (!(await allOptedIn(db, people.map((h) => h.id))) || !(await shareATeam(db, people.map((h) => h.id)))) return null;
  const eventType = await findPublicEventType(db, people[0].id, slug);
  // Seats, series and private links are single-host features.
  if (!eventType || eventType.seatsPerSlot || eventType.recurringFrequency || eventType.linkOnly) return null;
  return {
    kind: "group",
    eventType,
    host: people[0],
    hosts: people.map((host) => ({ host, fixed: true, weight: 100, priority: 2, scheduleId: null })),
    displayName: people.map((h) => h.name).join(" & "),
    basePath: `/${people.map((h) => h.username).join("+")}`,
  };
}

async function resolveTeam(db: Database, teamSlug: string, slug: string): Promise<BookingTarget | null> {
  const team = await findPublicTeam(db, teamSlug);
  if (!team) return null;
  const found = await findPublicTeamEventType(db, team.id, slug);
  if (!found || !found.hosts.length) return null;
  return {
    kind: "team",
    eventType: found.eventType,
    host: found.hosts[0].host,
    hosts: found.hosts.map((h) => ({ host: h.host, fixed: h.isFixed, weight: h.weight, priority: h.priority, scheduleId: h.scheduleId })),
    displayName: team.name,
    basePath: `/team/${team.slug}`,
    team,
  };
}

export async function resolveBookingTarget(db: Database, key: TargetKey): Promise<BookingTarget | null> {
  if (key.team) return resolveTeam(db, key.team, key.slug);
  if (!key.username) return null;
  const group = groupUsernames(key.username);
  if (group) return resolveGroup(db, group, key.slug);
  const host = await findPublicHost(db, key.username);
  const eventType = host ? await findPublicEventType(db, host.id, key.slug) : null;
  if (!host || !eventType) return null;
  return { kind: "user", eventType, host, displayName: host.name, basePath: `/${host.username}` };
}
