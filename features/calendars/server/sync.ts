import { and, eq, inArray } from "drizzle-orm";
import { booking, bookingReference, connectedCalendar, credential, destinationCalendar, eventType } from "@/db/schema";
import { coHosts } from "@/features/bookings/server/notifications";
import { type BookingDetails, findBookingById } from "@/features/bookings/server/service";
import { IntegrationError } from "@/lib/integrations/errors";
import type { CalendarEventInput } from "@/lib/integrations/types";
import { newId } from "@/lib/ids";
import { errorSummary, logger } from "@/lib/logger";
import { invalidateBusyCache } from "./busy";
import { type IntegrationDeps, withCredential } from "./credentials";

/**
 * Mirrors bookings to external systems (INT-007/008/009): an event in the destination calendar
 * (with Meet/Teams when chosen) and, for Zoom locations, a Zoom meeting. References are kept per
 * booking so reschedules update in place and cancellations delete. Failures are recorded on the
 * reference and never undo the booking (INT-012).
 *
 * Every function is safe to run again (job retries): existing synced references are reused, a
 * failed one is retried in place, and reschedules find references on either booking. `retryable`
 * reports transient provider failures the caller may retry.
 */

export type SyncOutcome = { meetingUrl?: string; failures: string[]; retryable: boolean };

type Reference = typeof bookingReference.$inferSelect;
const isRetryable = (error: unknown) => error instanceof IntegrationError && (error.kind === "transient" || error.kind === "rate_limited");

type Destination = { connectedCalendarId: string; credentialId: string; externalId: string; provider: string };

async function destinationFor(deps: IntegrationDeps, details: BookingDetails): Promise<Destination | null> {
  const [et] = await deps.db.select({ dest: eventType.destinationCalendarId }).from(eventType).where(eq(eventType.id, details.booking.eventTypeId));
  const [userDest] = await deps.db.select().from(destinationCalendar).where(eq(destinationCalendar.userId, details.host.id));
  const id = et?.dest ?? userDest?.connectedCalendarId;
  if (!id) return null;
  const [row] = await deps.db
    .select({
      connectedCalendarId: connectedCalendar.id,
      credentialId: connectedCalendar.credentialId,
      externalId: connectedCalendar.externalId,
      provider: credential.provider,
      readOnly: connectedCalendar.readOnly,
      invalidAt: credential.invalidAt,
    })
    .from(connectedCalendar)
    .innerJoin(credential, eq(credential.id, connectedCalendar.credentialId))
    .where(and(eq(connectedCalendar.id, id), eq(connectedCalendar.userId, details.host.id)));
  return row && !row.readOnly && !row.invalidAt ? row : null;
}

async function zoomCredential(deps: IntegrationDeps, userId: string): Promise<string | null> {
  const [row] = await deps.db
    .select({ id: credential.id, invalidAt: credential.invalidAt })
    .from(credential)
    .where(and(eq(credential.userId, userId), eq(credential.provider, "zoom")));
  return row && !row.invalidAt ? row.id : null;
}

function eventInput(details: BookingDetails, appHost: string, meetingUrl?: string): CalendarEventInput {
  const { booking: b, host, attendees } = details;
  const kind = b.locationKind;
  return {
    uid: `${b.icalUid}@${appHost}`,
    title: b.title,
    description: [b.notes, meetingUrl && `Join: ${meetingUrl}`].filter(Boolean).join("\n\n"),
    start: b.startAt.getTime(),
    end: b.endAt.getTime(),
    timeZone: host.timeZone,
    organizer: { name: host.name, email: host.email },
    // Collective co-hosts are invited to the organizer's event (TEAM-004).
    attendees: [...attendees.map((a) => ({ name: a.name, email: a.email })), ...coHosts(details).map((h) => ({ name: h.name, email: h.email }))],
    location: meetingUrl ?? b.locationValue ?? undefined,
    conference: kind === "google_meet" ? "google_meet" : kind === "ms_teams" ? "ms_teams" : undefined,
  };
}

const message = (error: unknown) => (error instanceof IntegrationError ? error.message : "Unexpected error");

/** Inserts the reference, or updates `existing` (a failed earlier attempt) in place. */
async function record(
  deps: IntegrationDeps,
  existing: Reference | undefined,
  values: { bookingId: string; provider: string; kind: string; credentialId: string; externalCalendarId?: string; externalId?: string; meetingUrl?: string; error?: string },
) {
  const row = {
    provider: values.provider,
    credentialId: values.credentialId,
    externalCalendarId: values.externalCalendarId ?? null,
    externalId: values.externalId ?? null,
    meetingUrl: values.meetingUrl ?? null,
    status: values.error ? ("failed" as const) : ("synced" as const),
    lastError: values.error ?? null,
  };
  if (existing) {
    await deps.db
      .update(bookingReference)
      .set({ ...row, attempts: existing.attempts + 1 })
      .where(eq(bookingReference.id, existing.id));
  } else {
    await deps.db.insert(bookingReference).values({ ...row, id: newId(), bookingId: values.bookingId, kind: values.kind, attempts: 1 });
  }
}

const findBookingDetails = (deps: IntegrationDeps, id: string) => findBookingById(deps.db, id);

const refsFor = (deps: IntegrationDeps, bookingIds: string[]) =>
  deps.db.select().from(bookingReference).where(inArray(bookingReference.bookingId, bookingIds));

/** New booking: create the Zoom meeting first (its link goes into the calendar event). */
export async function syncCreated(deps: IntegrationDeps, details: BookingDetails): Promise<SyncOutcome> {
  const failures: string[] = [];
  let retryable = false;
  const b = details.booking;
  const existing = await refsFor(deps, [b.id]);
  const prior = (kind: string) => existing.find((r) => r.kind === kind);
  // A reference with an external id means the object exists (even if its last update failed).
  const exists = (kind: string) => Boolean(prior(kind)?.externalId);
  const fail = (label: string, error: unknown) => {
    failures.push(`${label}: ${message(error)}`);
    retryable ||= isRetryable(error);
  };

  let meetingUrl: string | undefined = exists("conferencing") ? (prior("conferencing")?.meetingUrl ?? undefined) : undefined;
  if (b.locationKind === "zoom" && !exists("conferencing")) {
    const credentialId = await zoomCredential(deps, details.host.id);
    if (!credentialId) failures.push("Zoom is not connected");
    else {
      try {
        const m = await withCredential(deps, credentialId, (ctx, provider) =>
          provider.conferencing!.createMeeting(ctx, { uid: b.uid, title: b.title, start: b.startAt.getTime(), end: b.endAt.getTime() }),
        );
        meetingUrl = m.url;
        await record(deps, prior("conferencing"), { bookingId: b.id, provider: "zoom", kind: "conferencing", credentialId, externalId: m.meetingId, meetingUrl: m.url });
      } catch (error) {
        fail("Zoom", error);
        await record(deps, prior("conferencing"), { bookingId: b.id, provider: "zoom", kind: "conferencing", credentialId, error: message(error) });
      }
    }
  }

  const calendarRef = prior("calendar");
  if (exists("calendar")) meetingUrl ??= calendarRef?.meetingUrl ?? undefined;
  else {
    const created = await createCalendarEvent(deps, details, calendarRef, meetingUrl);
    failures.push(...created.failures);
    retryable ||= created.retryable;
    meetingUrl ??= created.meetingUrl;
  }

  // A generated meeting link becomes the booking's location (shown in emails and the ICS).
  if (meetingUrl && ["zoom", "google_meet", "ms_teams"].includes(b.locationKind ?? "")) {
    await deps.db.update(booking).set({ locationValue: meetingUrl }).where(eq(booking.id, b.id));
  }
  if (failures.length) logger.warn("calendar.sync_failed", { bookingId: b.id, failures: failures.length, retryable });
  return { meetingUrl, failures, retryable };
}

async function createCalendarEvent(deps: IntegrationDeps, details: BookingDetails, existing: Reference | undefined, zoomUrl: string | undefined): Promise<SyncOutcome> {
  const b = details.booking;
  const wantsVideo = b.locationKind === "google_meet" || b.locationKind === "ms_teams";
  const dest = await destinationFor(deps, details);
  if (!dest) return { failures: wantsVideo ? ["No destination calendar for the video link"] : [], retryable: false };
  const failures: string[] = [];
  const provider = dest.provider;
  const wantsNative = (b.locationKind === "google_meet" && provider === "google") || (b.locationKind === "ms_teams" && provider === "microsoft");
  if (wantsVideo && !wantsNative) {
    failures.push(`${b.locationKind === "google_meet" ? "Google Meet" : "Teams"} needs a ${b.locationKind === "google_meet" ? "Google" : "Microsoft"} destination calendar`);
  }
  const appHost = new URL(deps.env.APP_URL).hostname;
  const base = { bookingId: b.id, provider, kind: "calendar", credentialId: dest.credentialId, externalCalendarId: dest.externalId };
  try {
    const created = await withCredential(deps, dest.credentialId, (ctx, p) => {
      const input = eventInput(details, appHost, zoomUrl);
      return p.calendar!.createEvent!(ctx, dest.externalId, wantsNative ? input : { ...input, conference: undefined });
    });
    await record(deps, existing, { ...base, externalId: created.externalId, meetingUrl: created.meetingUrl });
    await invalidateBusyCache(deps.db, [dest.connectedCalendarId]);
    return { meetingUrl: created.meetingUrl, failures, retryable: false };
  } catch (error) {
    await record(deps, existing, { ...base, error: message(error) });
    return { failures: [...failures, `${provider}: ${message(error)}`], retryable: isRetryable(error) };
  }
}

/** The booking and its reschedule predecessors, newest first (bounded). */
async function rescheduleChain(deps: IntegrationDeps, fromId: string): Promise<string[]> {
  const ids: string[] = [];
  for (let id: string | null = fromId; id && ids.length < 50; ) {
    ids.push(id);
    const [row] = await deps.db.select({ from: booking.rescheduledFromId }).from(booking).where(eq(booking.id, id));
    id = row?.from ?? null;
  }
  return ids;
}

/**
 * Reschedule: adopt the references of the whole reschedule chain (a skipped intermediate job or
 * a retry leaves them on an older booking), update existing events/meetings in place, then let
 * `syncCreated` fill any gap (e.g. an event whose creation had failed).
 */
export async function syncRescheduled(deps: IntegrationDeps, details: BookingDetails, previousBookingId: string): Promise<SyncOutcome> {
  const b = details.booking;
  const refs = await refsFor(deps, [...(await rescheduleChain(deps, previousBookingId)), b.id]);
  if (!refs.length) return syncCreated(deps, details);
  await deps.db.update(bookingReference).set({ bookingId: b.id }).where(inArray(bookingReference.id, refs.map((r) => r.id)));
  const appHost = new URL(deps.env.APP_URL).hostname;
  const failures: string[] = [];
  let retryable = false;
  const movable = refs.filter((r) => r.credentialId && r.externalId);
  let meetingUrl = movable.find((r) => r.meetingUrl)?.meetingUrl ?? undefined;

  for (const ref of movable.toSorted((x, y) => (x.kind === "conferencing" ? -1 : 0) - (y.kind === "conferencing" ? -1 : 0))) {
    try {
      await withCredential(deps, ref.credentialId!, async (ctx, provider) => {
        if (ref.kind === "conferencing") {
          await provider.conferencing!.updateMeeting(ctx, ref.externalId!, { uid: b.uid, title: b.title, start: b.startAt.getTime(), end: b.endAt.getTime() });
        } else {
          const updated = await provider.calendar!.updateEvent!(ctx, ref.externalCalendarId!, ref.externalId!, eventInput(details, appHost, meetingUrl));
          meetingUrl ??= updated.meetingUrl;
        }
      });
      await deps.db.update(bookingReference).set({ status: "synced", lastError: null }).where(eq(bookingReference.id, ref.id));
    } catch (error) {
      failures.push(`${ref.provider}: ${message(error)}`);
      retryable ||= isRetryable(error);
      await deps.db
        .update(bookingReference)
        .set({ status: "failed", lastError: message(error), attempts: ref.attempts + 1 })
        .where(eq(bookingReference.id, ref.id));
    }
  }
  if (meetingUrl) await deps.db.update(booking).set({ locationValue: meetingUrl }).where(eq(booking.id, b.id));
  const gaps = await syncCreated(deps, (await findBookingDetails(deps, b.id)) ?? details);
  const calendars = await deps.db.select({ id: connectedCalendar.id }).from(connectedCalendar).where(eq(connectedCalendar.userId, details.host.id));
  await invalidateBusyCache(deps.db, calendars.map((c) => c.id));
  return { meetingUrl: meetingUrl ?? gaps.meetingUrl, failures: [...failures, ...gaps.failures], retryable: retryable || gaps.retryable };
}

/** Cancellation: delete external events and meetings; best effort. */
export async function syncCancelled(deps: IntegrationDeps, bookingId: string): Promise<SyncOutcome> {
  const refs = await refsFor(deps, [bookingId]);
  const failures: string[] = [];
  let retryable = false;
  for (const ref of refs) {
    if (!ref.credentialId || !ref.externalId) {
      await deps.db.delete(bookingReference).where(eq(bookingReference.id, ref.id));
      continue;
    }
    try {
      await withCredential(deps, ref.credentialId, async (ctx, provider) => {
        if (ref.kind === "conferencing") await provider.conferencing!.deleteMeeting(ctx, ref.externalId!);
        else await provider.calendar!.deleteEvent!(ctx, ref.externalCalendarId!, ref.externalId!);
      });
      await deps.db.delete(bookingReference).where(eq(bookingReference.id, ref.id));
    } catch (error) {
      failures.push(`${ref.provider}: ${message(error)}`);
      retryable ||= isRetryable(error);
      logger.warn("calendar.delete_failed", { bookingId, provider: ref.provider, ...errorSummary(error) });
      await deps.db.update(bookingReference).set({ status: "failed", lastError: message(error) }).where(eq(bookingReference.id, ref.id));
    }
  }
  return { failures, retryable };
}
