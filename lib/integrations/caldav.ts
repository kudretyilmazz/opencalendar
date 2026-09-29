import { createDAVClient, type DAVCalendar } from "tsdav";
import { z } from "zod";
import { buildIcs } from "@/lib/ics";
import { ensureOk, IntegrationError, toIntegrationError } from "./errors";
import { busyFromIcs } from "./ical";
import type { CalendarAdapter, CalendarEventInput, ProviderContext, ProviderDefinition } from "./types";

/**
 * Generic CalDAV (INT-004): iCloud, Fastmail, Nextcloud and any RFC 4791 server.
 * Every request goes through the context's SSRF-safe fetch. Busy times are read with a
 * calendar-query + local recurrence expansion (free-busy-query isn't supported by iCloud).
 */

export const caldavCredentialSchema = z.object({
  serverUrl: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
});
export type CaldavCredential = z.infer<typeof caldavCredentialSchema>;

export { CALDAV_PRESETS } from "./caldav-presets";

type Ctx = ProviderContext<CaldavCredential>;

async function client(ctx: Ctx) {
  try {
    return await createDAVClient({
      serverUrl: ctx.credential.serverUrl,
      credentials: { username: ctx.credential.username, password: ctx.credential.password },
      authMethod: "Basic",
      defaultAccountType: "caldav",
      fetch: ctx.fetch as typeof globalThis.fetch,
    });
  } catch (error) {
    throw mapDavError(error, "CalDAV login");
  }
}

function mapDavError(error: unknown, what: string): IntegrationError {
  if (error instanceof IntegrationError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/401|403|unauthori[sz]ed|invalid credentials/i.test(message)) return new IntegrationError("auth", `${what}: credentials rejected`);
  return toIntegrationError(error, what);
}

const calendarRef = (url: string) => ({ url }) as DAVCalendar;

function objectUrl(calendarUrl: string, uid: string): string {
  return new URL(`${encodeURIComponent(uid)}.ics`, calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`).toString();
}

function toIcs(e: CalendarEventInput): string {
  return buildIcs({
    uid: e.uid,
    sequence: Math.floor(Date.now() / 1000), // monotonic so clients accept updates
    start: e.start,
    end: e.end,
    stamp: Date.now(),
    summary: e.title,
    description: e.description,
    location: e.location,
    organizer: e.organizer,
    attendees: e.attendees,
  });
}

export const caldavCalendar: CalendarAdapter<CaldavCredential> = {
  async listCalendars(ctx) {
    const dav = await client(ctx);
    try {
      const calendars = await dav.fetchCalendars();
      return calendars
        .filter((c) => !c.components || c.components.includes("VEVENT"))
        .map((c) => ({
          externalId: c.url,
          name: typeof c.displayName === "string" && c.displayName ? c.displayName : new URL(c.url).pathname,
          color: c.calendarColor,
          readOnly: false,
        }));
    } catch (error) {
      throw mapDavError(error, "CalDAV list calendars");
    }
  },

  async getBusy(ctx, calendarIds, range) {
    const dav = await client(ctx);
    const out: Record<string, ReturnType<typeof busyFromIcs>> = {};
    for (const url of calendarIds) {
      try {
        const objects = await dav.fetchCalendarObjects({
          calendar: calendarRef(url),
          timeRange: { start: new Date(range.start).toISOString(), end: new Date(range.end).toISOString() },
        });
        const data = objects.map((o) => o.data).filter((d): d is string => typeof d === "string" && d.includes("BEGIN:VCALENDAR"));
        out[url] = data.length ? busyFromIcs(data, range, range.timeZone) : [];
      } catch (error) {
        throw mapDavError(error, "CalDAV calendar-query");
      }
    }
    return out;
  },

  async createEvent(ctx, calendarId, e) {
    const dav = await client(ctx);
    const url = objectUrl(calendarId, e.uid);
    let res: Response;
    try {
      res = await dav.createCalendarObject({ calendar: calendarRef(calendarId), filename: `${encodeURIComponent(e.uid)}.ics`, iCalString: toIcs(e) });
    } catch (error) {
      throw mapDavError(error, "CalDAV create");
    }
    // 412: the object already exists (a retried create) – update it instead.
    if (res.status === 412) return this.updateEvent!(ctx, calendarId, url, e);
    await ensureOk(res, "CalDAV create");
    return { externalId: url };
  },

  async updateEvent(ctx, _calendarId, externalId, e) {
    const dav = await client(ctx);
    try {
      await ensureOk(await dav.updateCalendarObject({ calendarObject: { url: externalId, data: toIcs(e) } }), "CalDAV update");
    } catch (error) {
      throw mapDavError(error, "CalDAV update");
    }
    return { externalId };
  },

  async deleteEvent(ctx, _calendarId, externalId) {
    const dav = await client(ctx);
    let res: Response;
    try {
      res = await dav.deleteCalendarObject({ calendarObject: { url: externalId } });
    } catch (error) {
      throw mapDavError(error, "CalDAV delete");
    }
    if (res.status === 404) return;
    await ensureOk(res, "CalDAV delete");
  },
};

export const caldav: ProviderDefinition<CaldavCredential> = {
  id: "caldav",
  name: "CalDAV (iCloud, Fastmail, Nextcloud…)",
  auth: "caldav",
  credentialSchema: caldavCredentialSchema,
  calendar: caldavCalendar,
};

// ---------------------------------------------------------------------------- ICS feed (INT-005)

export const icsFeedCredentialSchema = z.object({ url: z.string().url() });
export type IcsFeedCredential = z.infer<typeof icsFeedCredentialSchema>;

/** A feed has exactly one calendar. Its id is opaque: the secret feed URL stays encrypted. */
export const ICS_FEED_CALENDAR_ID = "feed";

export const icsFeedCalendar: CalendarAdapter<IcsFeedCredential> = {
  async listCalendars(ctx) {
    const url = new URL(ctx.credential.url);
    return [{ externalId: ICS_FEED_CALENDAR_ID, name: `${url.hostname} (read-only feed)`, readOnly: true }];
  },
  async getBusy(ctx, calendarIds, range) {
    const res = await ensureOk(await ctx.fetch(ctx.credential.url, { headers: { accept: "text/calendar" } }), "ICS feed");
    const busy = busyFromIcs(await res.text(), range, range.timeZone);
    return Object.fromEntries(calendarIds.map((id) => [id, busy]));
  },
};

export const icsFeed: ProviderDefinition<IcsFeedCredential> = {
  id: "ics_feed",
  name: "ICS feed (read-only)",
  auth: "ics_url",
  credentialSchema: icsFeedCredentialSchema,
  calendar: icsFeedCalendar,
};
