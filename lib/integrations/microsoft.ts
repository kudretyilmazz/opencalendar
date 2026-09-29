import { ensureOk, IntegrationError } from "./errors";
import { bearer, oauthCredentialSchema } from "./oauth";
import type { BusyInterval, CalendarAdapter, CalendarEventInput, OAuthCredential, ProviderDefinition } from "./types";

/**
 * Microsoft 365 / Outlook.com via Microsoft Graph (INT-003) with Teams meetings (INT-008).
 * Attendees are not added to the Graph event: Outlook would send its own invitations on top of
 * ours. They are listed in the event body instead.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
type Cred = OAuthCredential;
const enc = encodeURIComponent;

/** showAs values that block time. "free" and "unknown" don't. */
// "unknown" counts as busy: when Graph can't say, blocking is the safe side.
const BUSY_STATES = new Set(["busy", "oof", "tentative", "workingElsewhere", "unknown"]);

type GraphEvent = {
  id: string;
  isCancelled?: boolean;
  showAs?: string;
  start?: { dateTime: string };
  end?: { dateTime: string };
  onlineMeeting?: { joinUrl?: string } | null;
};

/** Graph returns UTC wall times without an offset when asked for UTC. */
const utc = (dateTime: string) => Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(dateTime) ? dateTime : `${dateTime}Z`);

function eventBody(e: CalendarEventInput) {
  const who = e.attendees.map((a) => `${a.name} <${a.email}>`).join(", ");
  return {
    subject: e.title,
    body: { contentType: "text", content: `${e.description}\n\nInvitees: ${who}`.trim() },
    start: { dateTime: new Date(e.start).toISOString(), timeZone: "UTC" },
    end: { dateTime: new Date(e.end).toISOString(), timeZone: "UTC" },
    ...(e.location && { location: { displayName: e.location } }),
    ...(e.conference === "ms_teams" && { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" }),
  };
}

export const microsoftCalendar: CalendarAdapter<Cred> = {
  async listCalendars(ctx) {
    const res = await ensureOk(
      await ctx.fetch(`${GRAPH}/me/calendars?$select=id,name,hexColor,canEdit,isDefaultCalendar&$top=100`, { headers: bearer(ctx.credential) }),
      "Graph calendars",
    );
    const json = (await res.json()) as { value?: { id: string; name: string; hexColor?: string; canEdit?: boolean; isDefaultCalendar?: boolean }[] };
    return (json.value ?? []).map((c) => ({
      externalId: c.id,
      name: c.name,
      color: c.hexColor || undefined,
      readOnly: c.canEdit === false,
      primary: Boolean(c.isDefaultCalendar),
    }));
  },

  async getBusy(ctx, calendarIds, range) {
    const out: Record<string, BusyInterval[]> = {};
    for (const id of calendarIds) {
      const busy: BusyInterval[] = [];
      const params = new URLSearchParams({
        startDateTime: new Date(range.start).toISOString(),
        endDateTime: new Date(range.end).toISOString(),
        $select: "id,start,end,showAs,isCancelled",
        $top: "500",
      });
      let url: string | undefined = `${GRAPH}/me/calendars/${enc(id)}/calendarView?${params}`;
      while (url) {
        const res = await ensureOk(await ctx.fetch(url, { headers: bearer(ctx.credential, { prefer: 'outlook.timezone="UTC"' }) }), "Graph calendarView");
        const json = (await res.json()) as { value?: GraphEvent[]; "@odata.nextLink"?: string };
        for (const ev of json.value ?? []) {
          if (ev.isCancelled || !BUSY_STATES.has(ev.showAs ?? "busy") || !ev.start || !ev.end) continue;
          busy.push({ start: utc(ev.start.dateTime), end: utc(ev.end.dateTime), externalEventId: ev.id });
        }
        url = json["@odata.nextLink"];
      }
      out[id] = busy;
    }
    return out;
  },

  async createEvent(ctx, calendarId, e) {
    // transactionId makes retried creates idempotent on Graph's side.
    const res = await ensureOk(
      await ctx.fetch(`${GRAPH}/me/calendars/${enc(calendarId)}/events`, {
        method: "POST",
        headers: bearer(ctx.credential, { "content-type": "application/json" }),
        body: JSON.stringify({ ...eventBody(e), transactionId: e.uid }),
      }),
      "Graph create event",
    );
    const json = (await res.json()) as GraphEvent;
    return { externalId: json.id, meetingUrl: json.onlineMeeting?.joinUrl };
  },

  async updateEvent(ctx, _calendarId, externalId, e) {
    const res = await ensureOk(
      await ctx.fetch(`${GRAPH}/me/events/${enc(externalId)}`, {
        method: "PATCH",
        headers: bearer(ctx.credential, { "content-type": "application/json" }),
        body: JSON.stringify(eventBody(e)),
      }),
      "Graph update event",
    );
    const json = (await res.json()) as GraphEvent;
    return { externalId: json.id, meetingUrl: json.onlineMeeting?.joinUrl };
  },

  async deleteEvent(ctx, _calendarId, externalId) {
    const res = await ctx.fetch(`${GRAPH}/me/events/${enc(externalId)}`, { method: "DELETE", headers: bearer(ctx.credential) });
    if (res.status === 404) return;
    await ensureOk(res, "Graph delete event");
  },
};

export const microsoft: ProviderDefinition<Cred> = {
  id: "microsoft",
  name: "Microsoft 365 / Outlook",
  auth: "oauth2",
  oauth: {
    // The tenant segment is filled in by the connect route from MICROSOFT_TENANT_ID.
    authorizeUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
    scopes: ["openid", "email", "offline_access", "User.Read", "Calendars.ReadWrite"],
    clientAuth: "body",
    async accountLabel(fetch, accessToken) {
      const res = await ensureOk(await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: { authorization: `Bearer ${accessToken}` } }), "Graph me");
      const json = (await res.json()) as { mail?: string; userPrincipalName?: string };
      const label = json.mail ?? json.userPrincipalName;
      if (!label) throw new IntegrationError("invalid", "Microsoft did not return an account name");
      return label;
    },
  },
  client: (env) => env.oauth.microsoft,
  configureHint: "Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET (Azure app with Calendars.ReadWrite).",
  credentialSchema: oauthCredentialSchema,
  calendar: microsoftCalendar,
};
