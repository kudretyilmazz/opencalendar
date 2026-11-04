import { parseDate, wallToUtc } from "@/lib/availability/tz";
import { ensureOk, IntegrationError } from "./errors";
import { bearer, oauthCredentialSchema } from "./oauth";
import type { BusyInterval, CalendarAdapter, CalendarEventInput, OAuthCredential, ProviderDefinition } from "./types";

/**
 * Google Calendar (INT-002) with Google Meet (INT-008), via REST.
 * Busy times come from events.list (not freeBusy) so our own events can be recognized by id.
 */

const API = "https://www.googleapis.com/calendar/v3";
type Cred = OAuthCredential;

const enc = encodeURIComponent;

function eventBody(e: CalendarEventInput) {
  return {
    summary: e.title,
    description: e.description,
    start: { dateTime: new Date(e.start).toISOString(), timeZone: e.timeZone },
    end: { dateTime: new Date(e.end).toISOString(), timeZone: e.timeZone },
    attendees: e.attendees.map((a) => ({ email: a.email, displayName: a.name })),
    ...(e.location && { location: e.location }),
    reminders: { useDefault: true },
  };
}

function meetingUrl(json: { hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] } }) {
  return json.hangoutLink ?? json.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
}

type GoogleEvent = {
  id: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

/** All-day events (`date`) span local midnights in the host's zone, not UTC. */
function toMs(t: { dateTime?: string; date?: string } | undefined, timeZone: string): number {
  if (t?.dateTime) return Date.parse(t.dateTime);
  if (!t?.date) return Number.NaN;
  try {
    return wallToUtc(parseDate(t.date), 0, timeZone);
  } catch {
    return Number.NaN;
  }
}

const declinedBySelf = (ev: GoogleEvent) => ev.attendees?.some((a) => a.self && a.responseStatus === "declined") ?? false;

type GoogleCreated = Parameters<typeof meetingUrl>[0] & { id: string };

/** The live event holding `uid` (a cancelled one is not returned, so its 409 is reported). */
async function findByICalUid(ctx: Parameters<CalendarAdapter<Cred>["listCalendars"]>[0], calendarId: string, uid: string): Promise<GoogleCreated> {
  const params = new URLSearchParams({ iCalUID: uid, maxResults: "1" });
  const res = await ensureOk(await ctx.fetch(`${API}/calendars/${enc(calendarId)}/events?${params}`, { headers: bearer(ctx.credential) }), "Google events.list");
  const json = (await res.json()) as { items?: GoogleCreated[] };
  const found = json.items?.[0];
  if (!found) throw new IntegrationError("invalid", "Google event with this iCalUID already exists but could not be read", 409);
  return found;
}

export const googleCalendar: CalendarAdapter<Cred> = {
  async listCalendars(ctx) {
    const res = await ensureOk(await ctx.fetch(`${API}/users/me/calendarList?minAccessRole=freeBusyReader`, { headers: bearer(ctx.credential) }), "Google calendarList");
    const json = (await res.json()) as { items?: { id: string; summary?: string; backgroundColor?: string; accessRole?: string; primary?: boolean }[] };
    return (json.items ?? []).map((c) => ({
      externalId: c.id,
      name: c.summary ?? c.id,
      color: c.backgroundColor,
      readOnly: !(c.accessRole === "owner" || c.accessRole === "writer"),
      primary: Boolean(c.primary),
    }));
  },

  async getBusy(ctx, calendarIds, range) {
    const out: Record<string, BusyInterval[]> = {};
    for (const id of calendarIds) {
      const busy: BusyInterval[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          timeMin: new Date(range.start).toISOString(),
          timeMax: new Date(range.end).toISOString(),
          singleEvents: "true",
          maxResults: "2500",
          fields: "items(id,status,transparency,start,end,attendees(self,responseStatus)),nextPageToken",
          ...(pageToken && { pageToken }),
        });
        const res = await ensureOk(await ctx.fetch(`${API}/calendars/${enc(id)}/events?${params}`, { headers: bearer(ctx.credential) }), "Google events.list");
        const json = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
        for (const ev of json.items ?? []) {
          if (ev.status === "cancelled" || ev.transparency === "transparent" || declinedBySelf(ev)) continue;
          const start = toMs(ev.start, range.timeZone);
          const end = toMs(ev.end, range.timeZone);
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) busy.push({ start, end, externalEventId: ev.id });
        }
        pageToken = json.nextPageToken;
      } while (pageToken);
      out[id] = busy;
    }
    return out;
  },

  async createEvent(ctx, calendarId, e) {
    // iCalUID = the emailed ICS's UID, so Gmail's invitation card finds this (the organizer's) event.
    // Google forbids sending both `id` and `iCalUID`, so Google assigns the id.
    const body = {
      iCalUID: e.uid,
      ...eventBody(e),
      ...(e.conference === "google_meet" && {
        conferenceData: { createRequest: { requestId: e.uid, conferenceSolutionKey: { type: "hangoutsMeet" } } },
      }),
    };
    // sendUpdates=none: OpenCalendar sends its own invitations.
    const url = `${API}/calendars/${enc(calendarId)}/events?conferenceDataVersion=1&sendUpdates=none`;
    const res = await ctx.fetch(url, { method: "POST", headers: bearer(ctx.credential, { "content-type": "application/json" }), body: JSON.stringify(body) });
    // 409: already created by an earlier attempt (job retry), so read it back.
    const json = res.status === 409 ? await findByICalUid(ctx, calendarId, e.uid) : ((await (await ensureOk(res, "Google events.insert")).json()) as GoogleCreated);
    return { externalId: json.id, meetingUrl: meetingUrl(json) };
  },

  async updateEvent(ctx, calendarId, externalId, e) {
    const url = `${API}/calendars/${enc(calendarId)}/events/${enc(externalId)}?conferenceDataVersion=1&sendUpdates=none`;
    const res = await ensureOk(
      await ctx.fetch(url, { method: "PATCH", headers: bearer(ctx.credential, { "content-type": "application/json" }), body: JSON.stringify(eventBody(e)) }),
      "Google events.patch",
    );
    const json = (await res.json()) as Parameters<typeof meetingUrl>[0] & { id: string };
    return { externalId: json.id, meetingUrl: meetingUrl(json) };
  },

  async deleteEvent(ctx, calendarId, externalId) {
    const res = await ctx.fetch(`${API}/calendars/${enc(calendarId)}/events/${enc(externalId)}?sendUpdates=none`, {
      method: "DELETE",
      headers: bearer(ctx.credential),
    });
    if (res.status === 404 || res.status === 410) return; // already gone
    await ensureOk(res, "Google events.delete");
  },
};

export const google: ProviderDefinition<Cred> = {
  id: "google",
  name: "Google Calendar",
  auth: "oauth2",
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"],
    authorizeParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    clientAuth: "body",
    async accountLabel(fetch, accessToken) {
      const res = await ensureOk(await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${accessToken}` } }), "Google userinfo");
      const json = (await res.json()) as { email?: string };
      if (!json.email) throw new IntegrationError("invalid", "Google did not return an email");
      return json.email;
    },
  },
  client: (env) => env.oauth.google,
  configureHint: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and add the Calendar API to the OAuth app.",
  credentialSchema: oauthCredentialSchema,
  calendar: googleCalendar,
};
