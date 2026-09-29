import { and, asc, eq, gte, inArray, isNull, max, ne } from "drizzle-orm";
import type { Database, Tx } from "@/db/client";
import { booking, eventType, eventTypeHost, membership, team, user } from "@/db/schema";
import type { EventTypeForm } from "@/features/event-types/schemas";
import { columns, type EventTypeView, loadEventTypeViews, type PublicHost, writeEventTypeDetails } from "@/features/event-types/server/service";
import { newId } from "@/lib/ids";
import { lockedValues, templateForm } from "../managed";
import type { HostForm, SchedulingType } from "../schemas";
import { requireTeamRole, TeamError } from "./access";

/**
 * Team event types (TEAM-004…008). Admins manage them; hosts must be team members. Team event
 * types have no per-type schedule (each host's own schedule applies), no seats and no recurring
 * series — those stay personal-only in M4.
 */

export type HostRow = typeof eventTypeHost.$inferSelect;
export type TeamEventTypeView = EventTypeView & { hosts: (HostRow & { name: string; email: string })[] };

const ACTIVE = ["accepted", "pending", "awaiting_payment"] as const;

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505";

/** Personal-only settings are switched off for team event types. */
export function teamSafe(input: EventTypeForm): EventTypeForm {
  return { ...input, scheduleId: null, seatsPerSlot: null, seatsShowAttendees: false, recurringFrequency: null, recurringMaxCount: null, linkOnly: false };
}

async function hostsOf(db: Database | Tx, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ host: eventTypeHost, name: user.name, email: user.email })
    .from(eventTypeHost)
    .innerJoin(user, eq(user.id, eventTypeHost.userId))
    .where(inArray(eventTypeHost.eventTypeId, ids))
    .orderBy(asc(eventTypeHost.position));
}

async function withHosts(db: Database, views: EventTypeView[]): Promise<TeamEventTypeView[]> {
  const hosts = await hostsOf(db, views.map((v) => v.id));
  return views.map((v) => ({ ...v, hosts: hosts.filter((h) => h.host.eventTypeId === v.id).map((h) => ({ ...h.host, name: h.name, email: h.email })) }));
}

export async function listTeamEventTypes(db: Database, actorId: string, teamId: string): Promise<TeamEventTypeView[]> {
  await requireTeamRole(db, actorId, teamId, "member");
  const rows = await db.select().from(eventType).where(eq(eventType.teamId, teamId)).orderBy(asc(eventType.position), asc(eventType.createdAt));
  return withHosts(db, await loadEventTypeViews(db, rows));
}

export async function getTeamEventType(db: Database, actorId: string, teamId: string, id: string): Promise<TeamEventTypeView> {
  await requireTeamRole(db, actorId, teamId, "admin");
  const rows = await db.select().from(eventType).where(and(eq(eventType.id, id), eq(eventType.teamId, teamId)));
  const [view] = await withHosts(db, await loadEventTypeViews(db, rows));
  if (!view) throw new TeamError("NOT_FOUND");
  return view;
}

export async function createTeamEventType(db: Database, actorId: string, teamId: string, schedulingType: SchedulingType, raw: EventTypeForm): Promise<string> {
  await requireTeamRole(db, actorId, teamId, "admin");
  const input = teamSafe(raw);
  const id = newId();
  try {
    await db.transaction(async (tx) => {
      const [{ value }] = await tx.select({ value: max(eventType.position) }).from(eventType).where(eq(eventType.teamId, teamId));
      await tx.insert(eventType).values({ id, ownerUserId: actorId, teamId, schedulingType, position: (value ?? -1) + 1, ...columns(input) });
      await writeEventTypeDetails(tx, id, input);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new TeamError("SLUG_TAKEN");
    throw error;
  }
  return id;
}

/**
 * Saves the team event type. A managed template pushes its locked fields to every copy in the
 * same transaction, so template and copies never disagree (TEAM-008).
 */
export async function updateTeamEventType(db: Database, actorId: string, teamId: string, id: string, raw: EventTypeForm): Promise<void> {
  const current = await getTeamEventType(db, actorId, teamId, id);
  const input = teamSafe(raw);
  try {
    await db.transaction(async (tx) => {
      await tx.update(eventType).set(columns(input)).where(and(eq(eventType.id, id), eq(eventType.teamId, teamId)));
      await writeEventTypeDetails(tx, id, input);
      if (current.schedulingType === "managed") await propagate(tx, id);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new TeamError("SLUG_TAKEN");
    throw error;
  }
}

export async function setTeamEventTypeEnabled(db: Database, actorId: string, teamId: string, id: string, enabled: boolean): Promise<void> {
  await requireTeamRole(db, actorId, teamId, "admin");
  const updated = await db.update(eventType).set({ enabled }).where(and(eq(eventType.id, id), eq(eventType.teamId, teamId))).returning({ id: eventType.id });
  if (!updated.length) throw new TeamError("NOT_FOUND");
}

async function hasUpcoming(db: Database | Tx, eventTypeIds: string[], now: number): Promise<boolean> {
  if (!eventTypeIds.length) return false;
  const [row] = await db
    .select({ id: booking.id })
    .from(booking)
    .where(and(inArray(booking.eventTypeId, eventTypeIds), inArray(booking.status, [...ACTIVE]), gte(booking.endAt, new Date(now))))
    .limit(1);
  return Boolean(row);
}

/** Refused while it (or, for a template, any member copy) has upcoming bookings. */
export async function deleteTeamEventType(db: Database, actorId: string, teamId: string, id: string, now: number): Promise<void> {
  await getTeamEventType(db, actorId, teamId, id); // role + team scope first: no cross-team oracle
  const children = await db.select({ id: eventType.id }).from(eventType).where(eq(eventType.parentId, id));
  if (await hasUpcoming(db, [id, ...children.map((c) => c.id)], now)) throw new TeamError("FORBIDDEN", "has_upcoming_bookings");
  const deleted = await db.delete(eventType).where(and(eq(eventType.id, id), eq(eventType.teamId, teamId))).returning({ id: eventType.id });
  if (!deleted.length) throw new TeamError("NOT_FOUND");
}

async function assertMembers(tx: Database | Tx, teamId: string, userIds: string[]) {
  if (!userIds.length) return;
  const rows = await tx.select({ userId: membership.userId }).from(membership).where(and(eq(membership.teamId, teamId), inArray(membership.userId, userIds)));
  if (rows.length !== new Set(userIds).size) throw new TeamError("NOT_A_HOST");
}

/** TEAM-004…007: replaces the host list of a collective or round-robin event type. */
export async function setHosts(
  db: Database,
  actorId: string,
  teamId: string,
  id: string,
  input: { hosts: HostForm[]; roundRobinWindowDays: number },
): Promise<void> {
  const et = await getTeamEventType(db, actorId, teamId, id);
  if (et.schedulingType === "managed") throw new TeamError("FORBIDDEN", "managed");
  // Collective: everyone attends, so every host is fixed.
  const hosts = input.hosts.map((h) => (et.schedulingType === "collective" ? { ...h, isFixed: true } : h));
  await db.transaction(async (tx) => {
    await assertMembers(tx, teamId, hosts.map((h) => h.userId));
    await tx.delete(eventTypeHost).where(eq(eventTypeHost.eventTypeId, id));
    if (hosts.length) await tx.insert(eventTypeHost).values(hosts.map((h, position) => ({ ...h, eventTypeId: id, position })));
    await tx.update(eventType).set({ roundRobinWindowDays: input.roundRobinWindowDays }).where(eq(eventType.id, id));
  });
}

// ---------------------------------------------------------------------------- managed (TEAM-008)

async function templateView(db: Database | Tx, id: string): Promise<EventTypeView> {
  const [view] = await loadEventTypeViews(db, await db.select().from(eventType).where(eq(eventType.id, id)));
  if (!view) throw new TeamError("NOT_FOUND");
  return view;
}

/** Pushes the template's locked fields to every member copy (inside the caller's transaction). */
async function propagate(tx: Tx, templateId: string): Promise<void> {
  const template = await templateView(tx, templateId);
  const { extraDurations, locations, questions, ...scalar } = lockedValues(template);
  const children = await loadEventTypeViews(tx, await tx.select().from(eventType).where(eq(eventType.parentId, templateId)));
  for (const child of children) {
    await tx.update(eventType).set(scalar).where(eq(eventType.id, child.id));
    await writeEventTypeDetails(tx, child.id, {
      extraDurations: extraDurations ?? child.extraDurations,
      locations: locations ?? child.locations,
      questions: questions ?? child.questions,
    });
  }
}

/**
 * A copy that leaves its template (unassigned with upcoming bookings, or its owner left the
 * team) stays as a personal event type so those bookings remain valid — switched off and without
 * the template's redirect, since its content was chosen by the team, not by its owner.
 */
export async function detachCopies(tx: Tx, where: ReturnType<typeof and>): Promise<void> {
  await tx.update(eventType).set({ parentId: null, enabled: false, redirectUrl: null, redirectForwardParams: false }).where(where);
}

/**
 * Sets the locked fields and the assigned members. New assignees get a copy of the whole
 * template; removed ones lose theirs — or, when it still has upcoming bookings, keep it as a
 * plain personal event type so those bookings stay valid.
 */
export async function setManaged(
  db: Database,
  actorId: string,
  teamId: string,
  id: string,
  input: { lockedFields: string[]; assignees: string[]; now: number },
): Promise<{ detached: string[] }> {
  const et = await getTeamEventType(db, actorId, teamId, id);
  if (et.schedulingType !== "managed") throw new TeamError("FORBIDDEN", "not_managed");
  const assignees = [...new Set(input.assignees)];
  const detached: string[] = [];
  try {
    await db.transaction(async (tx) => {
      await assertMembers(tx, teamId, assignees);
      await tx.update(eventType).set({ lockedFields: [...new Set(input.lockedFields)] }).where(eq(eventType.id, id));
      const template = await templateView(tx, id);
      const children = await tx.select({ id: eventType.id, owner: eventType.ownerUserId }).from(eventType).where(eq(eventType.parentId, id));
      const wanted = new Set(assignees);
      for (const child of children.filter((c) => !wanted.has(c.owner))) {
        if (await hasUpcoming(tx, [child.id], input.now)) {
          await detachCopies(tx, eq(eventType.id, child.id));
          detached.push(child.owner);
        } else {
          await tx.delete(eventType).where(eq(eventType.id, child.id));
        }
      }
      const have = new Set(children.map((c) => c.owner));
      const form = templateForm(template);
      for (const userId of assignees.filter((u) => !have.has(u))) {
        const childId = newId();
        const [{ value }] = await tx.select({ value: max(eventType.position) }).from(eventType).where(and(eq(eventType.ownerUserId, userId), isNull(eventType.teamId)));
        const [taken] = await tx.select({ id: eventType.id }).from(eventType).where(and(eq(eventType.ownerUserId, userId), isNull(eventType.teamId), eq(eventType.slug, form.slug)));
        if (taken) throw new TeamError("SLUG_TAKEN", userId);
        await tx.insert(eventType).values({ ...columns(form), id: childId, ownerUserId: userId, parentId: id, position: (value ?? -1) + 1 });
        // No per-copy reminder: the team's workflows already apply to managed copies (NTF-007).
        await writeEventTypeDetails(tx, childId, form);
      }
      // The host list mirrors the assignees (shown on the team page and the availability view).
      await tx.delete(eventTypeHost).where(eq(eventTypeHost.eventTypeId, id));
      if (assignees.length) await tx.insert(eventTypeHost).values(assignees.map((userId, position) => ({ eventTypeId: id, userId, position, isFixed: true })));
      await propagate(tx, id);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new TeamError("SLUG_TAKEN");
    throw error;
  }
  return { detached };
}

/** The template a member's copy belongs to, with its team, for the member's edit page. */
export async function managedParentOf(db: Database, childParentId: string) {
  const [row] = await db
    .select({ id: eventType.id, lockedFields: eventType.lockedFields, teamName: team.name })
    .from(eventType)
    .innerJoin(team, eq(team.id, eventType.teamId))
    .where(eq(eventType.id, childParentId));
  return row ?? null;
}

// ---------------------------------------------------------------------------- public (TEAM-001)

export type PublicTeam = { id: string; name: string; slug: string; logoUrl: string | null; brandColor: string | null };

export async function findPublicTeam(db: Database, slug: string): Promise<PublicTeam | null> {
  const [row] = await db
    .select({ id: team.id, name: team.name, slug: team.slug, logoUrl: team.logoUrl, brandColor: team.brandColor })
    .from(team)
    .where(eq(team.slug, slug.toLowerCase()));
  return row ?? null;
}

/** Enabled, visible collective and round-robin event types (templates aren't bookable). */
export async function listPublicTeamEventTypes(db: Database, teamId: string): Promise<EventTypeView[]> {
  const rows = await db
    .select()
    .from(eventType)
    .where(and(eq(eventType.teamId, teamId), eq(eventType.enabled, true), eq(eventType.hidden, false), ne(eventType.schedulingType, "managed")))
    .orderBy(asc(eventType.position), asc(eventType.createdAt));
  return loadEventTypeViews(db, rows);
}

export type PublicTeamHost = { host: PublicHost; isFixed: boolean; weight: number; priority: number; scheduleId: string | null };

/**
 * A bookable team event type with its hosts. Hosts must still be members, verified and not
 * disabled; unusable pool hosts are skipped, an unusable fixed host makes it unbookable.
 */
export async function findPublicTeamEventType(db: Database, teamId: string, slug: string): Promise<{ eventType: EventTypeView; hosts: PublicTeamHost[] } | null> {
  const rows = await db
    .select()
    .from(eventType)
    .where(and(eq(eventType.teamId, teamId), eq(eventType.slug, slug.toLowerCase()), eq(eventType.enabled, true), ne(eventType.schedulingType, "managed")));
  const [view] = await loadEventTypeViews(db, rows);
  if (!view) return null;
  const hostRows = await db
    .select({ h: eventTypeHost, u: user })
    .from(eventTypeHost)
    .innerJoin(user, eq(user.id, eventTypeHost.userId))
    .innerJoin(membership, and(eq(membership.userId, eventTypeHost.userId), eq(membership.teamId, teamId)))
    .where(eq(eventTypeHost.eventTypeId, view.id))
    .orderBy(asc(eventTypeHost.position));
  const usable = (r: (typeof hostRows)[number]) => r.u.emailVerified && !r.u.disabledAt;
  // A fixed host who can't take bookings makes every slot impossible: not bookable at all.
  if (hostRows.some((r) => (view.schedulingType === "collective" || r.h.isFixed) && !usable(r))) return null;
  const hosts = hostRows
    .filter(usable)
    .map(
      (r): PublicTeamHost => ({
        host: { id: r.u.id, name: r.u.name, email: r.u.email, username: r.u.username ?? "", timeZone: r.u.timeZone, locale: r.u.locale, timeFormat: r.u.timeFormat, image: r.u.image },
        isFixed: view.schedulingType === "collective" || r.h.isFixed,
        weight: r.h.weight,
        priority: r.h.priority,
        scheduleId: r.h.scheduleId,
      }),
    );
  return { eventType: view, hosts };
}
