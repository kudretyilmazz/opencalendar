import { personalOf } from "@/features/event-types/server/service";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { connectedCalendar, credential, destinationCalendar, eventType, eventTypeConflictCalendar } from "@/db/schema";
import { getProvider } from "@/lib/integrations/registry";
import type { ProviderDefinition, ProviderId } from "@/lib/integrations/types";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { decryptCredential, type IntegrationDeps, withCredential } from "./credentials";

export class ConnectionError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "READ_ONLY" | "NO_CALENDARS") {
    super(code);
    this.name = "ConnectionError";
  }
}

type ListedCalendar = Awaited<ReturnType<NonNullable<ProviderDefinition<unknown>["calendar"]>["listCalendars"]>>[number];

/**
 * Reconciles connected_calendar rows with the provider's list. An empty list from a calendar
 * provider is treated as a glitch, not "delete everything": settings survive a bad response.
 */
async function reconcileCalendars(deps: IntegrationDeps, credentialId: string, calendars: readonly ListedCalendar[]): Promise<void> {
  const [row] = await deps.db.select().from(credential).where(eq(credential.id, credentialId));
  const provider = getProvider(row.provider);
  if (provider.calendar && calendars.length === 0) {
    logger.warn("calendar.list_empty", { credentialId, provider: row.provider });
    return;
  }
  const readOnlyProvider = provider.auth === "ics_url";
  // Providers without a "primary" notion (CalDAV) check every calendar by default: missing a
  // conflict silently double-books, while an extra checked calendar is merely conservative.
  const hasPrimary = calendars.some((c) => c.primary);
  await deps.db.transaction(async (tx) => {
    for (const cal of calendars) {
      await tx
        .insert(connectedCalendar)
        .values({
          id: newId(),
          credentialId,
          userId: row.userId,
          externalId: cal.externalId,
          name: cal.name,
          color: cal.color ?? null,
          readOnly: cal.readOnly || readOnlyProvider,
          isPrimary: Boolean(cal.primary),
          // Sensible defaults: the primary calendar (or a feed) blocks availability.
          checkConflicts: Boolean(cal.primary) || readOnlyProvider || !hasPrimary,
        })
        .onConflictDoUpdate({
          target: [connectedCalendar.credentialId, connectedCalendar.externalId],
          set: { name: cal.name, color: cal.color ?? null, readOnly: cal.readOnly || readOnlyProvider, isPrimary: Boolean(cal.primary) },
        });
    }
    const keep = calendars.map((c) => c.externalId);
    await tx
      .delete(connectedCalendar)
      .where(and(eq(connectedCalendar.credentialId, credentialId), keep.length ? notInArray(connectedCalendar.externalId, keep) : undefined));
  });
}

/** Pulls the calendar list from the provider and reconciles connected_calendar rows. */
export async function syncCalendarList(deps: IntegrationDeps, credentialId: string): Promise<void> {
  const calendars = await withCredential(deps, credentialId, async (ctx, provider) => (provider.calendar ? provider.calendar.listCalendars(ctx) : []));
  await reconcileCalendars(deps, credentialId, calendars);
}

/** Lists calendars with a credential that is not stored yet: verification before any write. */
async function verifyPayload(deps: IntegrationDeps, provider: ProviderDefinition<unknown>, payload: unknown): Promise<ListedCalendar[]> {
  if (!provider.calendar) return [];
  // Freshly issued tokens need no refresh, so there is nothing to save here.
  const calendars = await provider.calendar.listCalendars({ credential: payload, fetch: deps.fetchFor(provider), saveCredential: async () => undefined });
  if (calendars.length === 0) throw new ConnectionError("NO_CALENDARS");
  return calendars;
}

/**
 * Connects (or reconnects) an account (INT-006/007): the new credential is verified by listing
 * calendars *before* anything is written, so a failed reconnect never replaces a working
 * credential. One credential per (user, provider, label), enforced by a unique index.
 */
export async function connectAccount(
  deps: IntegrationDeps,
  input: { userId: string; provider: ProviderDefinition<unknown>; label: string; payload: unknown },
): Promise<string> {
  const payload = input.provider.credentialSchema.parse(input.payload);
  const calendars = await verifyPayload(deps, input.provider, payload);
  const label = input.label.slice(0, 300);
  const credentialId = await deps.db.transaction(async (tx) => {
    const id = newId();
    const [inserted] = await tx
      .insert(credential)
      .values({ id, userId: input.userId, provider: input.provider.id, label, encryptedPayload: deps.cipher.encrypt(JSON.stringify(payload), id) })
      .onConflictDoNothing({ target: [credential.userId, credential.provider, credential.label] })
      .returning({ id: credential.id });
    if (inserted) return inserted.id;
    const [existing] = await tx
      .select({ id: credential.id })
      .from(credential)
      .where(and(eq(credential.userId, input.userId), eq(credential.provider, input.provider.id), eq(credential.label, label)))
      .for("update");
    await tx
      .update(credential)
      .set({ encryptedPayload: deps.cipher.encrypt(JSON.stringify(payload), existing.id), invalidAt: null, lastError: null })
      .where(eq(credential.id, existing.id));
    return existing.id;
  });
  await reconcileCalendars(deps, credentialId, calendars);
  await ensureDestination(deps.db, input.userId);
  return credentialId;
}

/** Chooses a default destination: the first writable primary (else writable) calendar. */
export async function ensureDestination(db: Database, userId: string): Promise<void> {
  const [current] = await db.select().from(destinationCalendar).where(eq(destinationCalendar.userId, userId));
  if (current) return;
  const candidates = await db
    .select({ id: connectedCalendar.id, isPrimary: connectedCalendar.isPrimary })
    .from(connectedCalendar)
    .where(and(eq(connectedCalendar.userId, userId), eq(connectedCalendar.readOnly, false)))
    .orderBy(asc(connectedCalendar.createdAt));
  const pick = candidates.find((c) => c.isPrimary) ?? candidates[0];
  if (pick) await db.insert(destinationCalendar).values({ userId, connectedCalendarId: pick.id }).onConflictDoNothing();
}

export type ConnectionView = {
  id: string;
  provider: ProviderId;
  providerName: string;
  label: string;
  invalid: boolean;
  lastError: string | null;
  calendars: { id: string; name: string; color: string | null; readOnly: boolean; checkConflicts: boolean; isDestination: boolean }[];
};

export async function listConnections(db: Database, userId: string): Promise<ConnectionView[]> {
  const [creds, calendars, [destination]] = await Promise.all([
    db.select().from(credential).where(eq(credential.userId, userId)).orderBy(asc(credential.createdAt)),
    db.select().from(connectedCalendar).where(eq(connectedCalendar.userId, userId)).orderBy(asc(connectedCalendar.name)),
    db.select().from(destinationCalendar).where(eq(destinationCalendar.userId, userId)),
  ]);
  return creds.map((c) => ({
    id: c.id,
    provider: c.provider as ProviderId,
    providerName: getProvider(c.provider).name,
    label: c.label,
    invalid: c.invalidAt !== null,
    lastError: c.lastError,
    calendars: calendars
      .filter((cal) => cal.credentialId === c.id)
      .map((cal) => ({
        id: cal.id,
        name: cal.name,
        color: cal.color,
        readOnly: cal.readOnly,
        checkConflicts: cal.checkConflicts,
        isDestination: destination?.connectedCalendarId === cal.id,
      })),
  }));
}

async function ownedCalendar(db: Database, userId: string, calendarId: string) {
  const [cal] = await db
    .select()
    .from(connectedCalendar)
    .where(and(eq(connectedCalendar.id, calendarId), eq(connectedCalendar.userId, userId)));
  if (!cal) throw new ConnectionError("NOT_FOUND");
  return cal;
}

export async function setConflictCheck(db: Database, userId: string, calendarId: string, enabled: boolean): Promise<void> {
  await ownedCalendar(db, userId, calendarId);
  await db.update(connectedCalendar).set({ checkConflicts: enabled }).where(eq(connectedCalendar.id, calendarId));
}

export async function setDestination(db: Database, userId: string, calendarId: string | null): Promise<void> {
  if (calendarId === null) {
    await db.delete(destinationCalendar).where(eq(destinationCalendar.userId, userId));
    return;
  }
  const cal = await ownedCalendar(db, userId, calendarId);
  if (cal.readOnly) throw new ConnectionError("READ_ONLY");
  await db
    .insert(destinationCalendar)
    .values({ userId, connectedCalendarId: calendarId })
    .onConflictDoUpdate({ target: destinationCalendar.userId, set: { connectedCalendarId: calendarId } });
}

export async function disconnectAccount(db: Database, userId: string, credentialId: string): Promise<void> {
  const deleted = await db
    .delete(credential)
    .where(and(eq(credential.id, credentialId), eq(credential.userId, userId)))
    .returning({ id: credential.id });
  if (!deleted.length) throw new ConnectionError("NOT_FOUND");
  await ensureDestination(db, userId);
}

// ---------------------------------------------------------------------------- per event type (INT-006/007)

export type EventTypeCalendarSettings = { conflictCalendarIds: string[]; destinationCalendarId: string | null };

export async function getEventTypeCalendars(db: Database, eventTypeId: string): Promise<EventTypeCalendarSettings> {
  const [rows, [et]] = await Promise.all([
    db.select().from(eventTypeConflictCalendar).where(eq(eventTypeConflictCalendar.eventTypeId, eventTypeId)),
    db.select({ destination: eventType.destinationCalendarId }).from(eventType).where(eq(eventType.id, eventTypeId)),
  ]);
  return { conflictCalendarIds: rows.map((r) => r.connectedCalendarId), destinationCalendarId: et?.destination ?? null };
}

/** Empty `conflictCalendarIds` = use the account-level defaults. */
export async function setEventTypeCalendars(db: Database, userId: string, eventTypeId: string, settings: EventTypeCalendarSettings): Promise<void> {
  const [et] = await db.select({ id: eventType.id }).from(eventType).where(and(eq(eventType.id, eventTypeId), personalOf(userId)));
  if (!et) throw new ConnectionError("NOT_FOUND");
  const ids = [...new Set(settings.conflictCalendarIds)];
  const owned = ids.length
    ? await db.select({ id: connectedCalendar.id }).from(connectedCalendar).where(and(eq(connectedCalendar.userId, userId), inArray(connectedCalendar.id, ids)))
    : [];
  if (owned.length !== ids.length) throw new ConnectionError("NOT_FOUND");
  if (settings.destinationCalendarId) {
    const dest = await ownedCalendar(db, userId, settings.destinationCalendarId);
    if (dest.readOnly) throw new ConnectionError("READ_ONLY");
  }
  await db.transaction(async (tx) => {
    await tx.delete(eventTypeConflictCalendar).where(eq(eventTypeConflictCalendar.eventTypeId, eventTypeId));
    if (ids.length) await tx.insert(eventTypeConflictCalendar).values(ids.map((connectedCalendarId) => ({ eventTypeId, connectedCalendarId })));
    await tx.update(eventType).set({ destinationCalendarId: settings.destinationCalendarId }).where(eq(eventType.id, eventTypeId));
  });
}

/** For the credential health banner (INT-012). */
export async function hasInvalidCredentials(db: Database, userId: string): Promise<boolean> {
  const rows = await db.select({ id: credential.id, invalidAt: credential.invalidAt }).from(credential).where(eq(credential.userId, userId));
  return rows.some((r) => r.invalidAt !== null);
}

export { decryptCredential };
