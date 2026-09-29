import { describe, expect, it } from "vitest";
import { googleCalendar, googleEventId } from "./google";
import { microsoftCalendar } from "./microsoft";
import type { CalendarEventInput, FetchLike, OAuthCredential, ProviderContext } from "./types";
import { zoomConferencing } from "./zoom";

/** Minimal fake HTTP server: routes "METHOD path-prefix" to handlers and records calls. */
function fakeApi(routes: Record<string, (req: { url: URL; body: unknown; headers: Headers }) => Response | Promise<Response>>) {
  const calls: { method: string; url: URL; body: unknown; headers: Headers }[] = [];
  const fetch: FetchLike = async (raw, init = {}) => {
    const url = new URL(raw);
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body, headers });
    const key = Object.keys(routes)
      .filter((k) => {
        const [m, prefix] = k.split(" ");
        return m === method && `${url.origin}${url.pathname}`.startsWith(prefix);
      })
      .toSorted((a, b) => b.length - a.length)[0];
    if (!key) return new Response("no route", { status: 599 });
    return routes[key]({ url, body, headers });
  };
  return { fetch, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const cred: OAuthCredential = { accessToken: "AT", refreshToken: "RT", expiresAt: Date.now() + 3_600_000 };
const ctx = (fetch: FetchLike): ProviderContext<OAuthCredential> => ({ credential: cred, fetch, saveCredential: async () => undefined });
const range = { start: Date.parse("2026-10-05T00:00:00Z"), end: Date.parse("2026-10-06T00:00:00Z"), timeZone: "UTC" };

const event: CalendarEventInput = {
  uid: "booking-ical-uid",
  title: "Intro between Ada and Grace",
  description: "Notes",
  start: Date.parse("2026-10-05T10:00:00Z"),
  end: Date.parse("2026-10-05T10:30:00Z"),
  timeZone: "Europe/Istanbul",
  organizer: { name: "Ada", email: "ada@x.test" },
  attendees: [{ name: "Grace", email: "grace@x.test" }],
  location: "Room 1",
};

describe("Google Calendar adapter (INT-002, INT-008)", () => {
  const G = "https://www.googleapis.com/calendar/v3";

  it("lists calendars with access and primary flags", async () => {
    const api = fakeApi({
      [`GET ${G}/users/me/calendarList`]: () =>
        json({ items: [{ id: "primary@x", summary: "Ada", accessRole: "owner", primary: true }, { id: "hol", summary: "Holidays", accessRole: "reader" }] }),
    });
    expect(await googleCalendar.listCalendars(ctx(api.fetch))).toEqual([
      { externalId: "primary@x", name: "Ada", color: undefined, readOnly: false, primary: true },
      { externalId: "hol", name: "Holidays", color: undefined, readOnly: true, primary: false },
    ]);
    expect(api.calls[0].headers.get("authorization")).toBe("Bearer AT");
  });

  it("reads busy times across pages, skipping free and cancelled events", async () => {
    const api = fakeApi({
      [`GET ${G}/calendars/`]: ({ url }) =>
        url.searchParams.get("pageToken")
          ? json({ items: [{ id: "e3", start: { dateTime: "2026-10-05T15:00:00Z" }, end: { dateTime: "2026-10-05T16:00:00Z" } }] })
          : json({
              nextPageToken: "p2",
              items: [
                { id: "e1", start: { dateTime: "2026-10-05T10:00:00+03:00" }, end: { dateTime: "2026-10-05T11:00:00+03:00" } },
                { id: "e2", transparency: "transparent", start: { dateTime: "2026-10-05T12:00:00Z" }, end: { dateTime: "2026-10-05T13:00:00Z" } },
                { id: "e4", status: "cancelled" },
              ],
            }),
    });
    const busy = await googleCalendar.getBusy(ctx(api.fetch), ["primary@x"], range);
    expect(busy["primary@x"]).toEqual([
      { start: Date.parse("2026-10-05T07:00:00Z"), end: Date.parse("2026-10-05T08:00:00Z"), externalEventId: "e1" },
      { start: Date.parse("2026-10-05T15:00:00Z"), end: Date.parse("2026-10-05T16:00:00Z"), externalEventId: "e3" },
    ]);
    expect(api.calls[0].url.searchParams.get("singleEvents")).toBe("true");
  });

  it("reads all-day events in the host's zone and skips events the user declined", async () => {
    const api = fakeApi({
      "GET https://www.googleapis.com/calendar/v3/calendars/": () =>
        json({
          items: [
            { id: "allday", start: { date: "2026-10-05" }, end: { date: "2026-10-06" } },
            { id: "declined", start: { dateTime: "2026-10-05T12:00:00Z" }, end: { dateTime: "2026-10-05T13:00:00Z" }, attendees: [{ self: true, responseStatus: "declined" }] },
            { id: "accepted", start: { dateTime: "2026-10-05T14:00:00Z" }, end: { dateTime: "2026-10-05T15:00:00Z" }, attendees: [{ self: true, responseStatus: "accepted" }] },
          ],
        }),
    });
    const out = await googleCalendar.getBusy(ctx(api.fetch), ["c1"], { ...range, timeZone: "Europe/Istanbul" });
    expect(out.c1.map((b) => [b.externalEventId, new Date(b.start).toISOString(), new Date(b.end).toISOString()])).toEqual([
      ["allday", "2026-10-04T21:00:00.000Z", "2026-10-05T21:00:00.000Z"],
      ["accepted", "2026-10-05T14:00:00.000Z", "2026-10-05T15:00:00.000Z"],
    ]);
  });

  it("creates events idempotently with a Meet link and no Google invitations", async () => {
    const api = fakeApi({
      [`POST ${G}/calendars/`]: ({ body }) => json({ id: (body as { id: string }).id, hangoutLink: "https://meet.google.com/abc-defg-hij" }),
    });
    const created = await googleCalendar.createEvent!(ctx(api.fetch), "primary@x", { ...event, conference: "google_meet" });
    expect(created).toEqual({ externalId: googleEventId(event.uid), meetingUrl: "https://meet.google.com/abc-defg-hij" });
    const call = api.calls[0];
    expect(call.url.searchParams.get("sendUpdates")).toBe("none");
    expect(call.url.searchParams.get("conferenceDataVersion")).toBe("1");
    expect(call.body).toMatchObject({
      id: googleEventId(event.uid),
      conferenceData: { createRequest: { requestId: event.uid, conferenceSolutionKey: { type: "hangoutsMeet" } } },
      attendees: [{ email: "grace@x.test", displayName: "Grace" }],
      start: { dateTime: "2026-10-05T10:00:00.000Z", timeZone: "Europe/Istanbul" },
    });
    expect(googleEventId(event.uid)).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it("treats a 409 on create as an earlier attempt and reads the event back", async () => {
    const api = fakeApi({
      [`POST ${G}/calendars/`]: () => json({ error: "duplicate" }, 409),
      [`GET ${G}/calendars/`]: () => json({ id: "existing", hangoutLink: "https://meet.google.com/x" }),
    });
    expect(await googleCalendar.createEvent!(ctx(api.fetch), "c", event)).toEqual({ externalId: "existing", meetingUrl: "https://meet.google.com/x" });
  });

  it("updates, deletes (tolerating 404/410) and maps 401 to an auth error", async () => {
    const api = fakeApi({
      [`PATCH ${G}/calendars/`]: () => json({ id: "ev1" }),
      [`DELETE ${G}/calendars/c/events/gone`]: () => new Response(null, { status: 410 }),
      [`DELETE ${G}/calendars/c/events/ev1`]: () => new Response(null, { status: 204 }),
      [`GET ${G}/users/me/calendarList`]: () => json({ error: "invalid" }, 401),
    });
    expect(await googleCalendar.updateEvent!(ctx(api.fetch), "c", "ev1", event)).toEqual({ externalId: "ev1", meetingUrl: undefined });
    await googleCalendar.deleteEvent!(ctx(api.fetch), "c", "ev1");
    await googleCalendar.deleteEvent!(ctx(api.fetch), "c", "gone");
    await expect(googleCalendar.listCalendars(ctx(api.fetch))).rejects.toMatchObject({ kind: "auth", status: 401 });
  });
});

describe("Microsoft Graph adapter (INT-003, INT-008)", () => {
  const G = "https://graph.microsoft.com/v1.0";

  it("lists calendars", async () => {
    const api = fakeApi({
      [`GET ${G}/me/calendars`]: () => json({ value: [{ id: "c1", name: "Calendar", canEdit: true, isDefaultCalendar: true, hexColor: "#aabbcc" }] }),
    });
    expect(await microsoftCalendar.listCalendars(ctx(api.fetch))).toEqual([
      { externalId: "c1", name: "Calendar", color: "#aabbcc", readOnly: false, primary: true },
    ]);
  });

  it("reads calendarView in UTC across pages, honoring showAs and cancellations", async () => {
    const api = fakeApi({
      [`GET ${G}/me/calendars/c1/calendarView`]: ({ url }) =>
        url.searchParams.get("$skip")
          ? json({ value: [{ id: "m3", showAs: "oof", start: { dateTime: "2026-10-05T18:00:00.0000000" }, end: { dateTime: "2026-10-05T19:00:00.0000000" } }] })
          : json({
              "@odata.nextLink": `${G}/me/calendars/c1/calendarView?$skip=2`,
              value: [
                { id: "m1", showAs: "busy", start: { dateTime: "2026-10-05T09:00:00.0000000" }, end: { dateTime: "2026-10-05T10:00:00.0000000" } },
                { id: "m2", showAs: "free", start: { dateTime: "2026-10-05T11:00:00.0000000" }, end: { dateTime: "2026-10-05T12:00:00.0000000" } },
                { id: "m4", showAs: "busy", isCancelled: true, start: { dateTime: "2026-10-05T13:00:00.0000000" }, end: { dateTime: "2026-10-05T14:00:00.0000000" } },
              ],
            }),
    });
    const busy = await microsoftCalendar.getBusy(ctx(api.fetch), ["c1"], range);
    expect(busy.c1.map((b) => [b.externalEventId, new Date(b.start).toISOString()])).toEqual([
      ["m1", "2026-10-05T09:00:00.000Z"],
      ["m3", "2026-10-05T18:00:00.000Z"],
    ]);
    expect(api.calls[0].headers.get("prefer")).toBe('outlook.timezone="UTC"');
  });

  it("creates Teams events without Graph attendees (no duplicate invitations), idempotently", async () => {
    const api = fakeApi({
      [`POST ${G}/me/calendars/c1/events`]: () => json({ id: "m-new", onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/x" } }),
    });
    const created = await microsoftCalendar.createEvent!(ctx(api.fetch), "c1", { ...event, conference: "ms_teams" });
    expect(created).toEqual({ externalId: "m-new", meetingUrl: "https://teams.microsoft.com/l/meetup-join/x" });
    const body = api.calls[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ transactionId: event.uid, isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" });
    expect(body.attendees).toBeUndefined();
    expect(JSON.stringify(body.body)).toContain("Grace <grace@x.test>");
  });

  it("updates and deletes events", async () => {
    const api = fakeApi({
      [`PATCH ${G}/me/events/m1`]: () => json({ id: "m1" }),
      [`DELETE ${G}/me/events/`]: () => new Response(null, { status: 404 }),
    });
    expect(await microsoftCalendar.updateEvent!(ctx(api.fetch), "c1", "m1", event)).toEqual({ externalId: "m1", meetingUrl: undefined });
    await expect(microsoftCalendar.deleteEvent!(ctx(api.fetch), "c1", "m9")).resolves.toBeUndefined();
  });
});

describe("Zoom adapter (INT-009)", () => {
  const Z = "https://api.zoom.us/v2";
  const meeting = { uid: "u", title: "Intro", start: Date.parse("2026-10-05T10:00:00Z"), end: Date.parse("2026-10-05T10:45:00Z") };

  it("creates, updates and deletes a scheduled meeting", async () => {
    const api = fakeApi({
      [`POST ${Z}/users/me/meetings`]: () => json({ id: 123456789, join_url: "https://zoom.us/j/123456789" }),
      [`PATCH ${Z}/meetings/123456789`]: () => new Response(null, { status: 204 }),
      [`DELETE ${Z}/meetings/`]: () => new Response(null, { status: 204 }),
    });
    expect(await zoomConferencing.createMeeting(ctx(api.fetch), meeting)).toEqual({ meetingId: "123456789", url: "https://zoom.us/j/123456789" });
    expect(api.calls[0].body).toEqual({
      topic: "Intro",
      type: 2,
      start_time: "2026-10-05T10:00:00Z",
      duration: 45,
      timezone: "UTC",
      settings: { join_before_host: false, waiting_room: true },
    });
    await zoomConferencing.updateMeeting(ctx(api.fetch), "123456789", meeting);
    await zoomConferencing.deleteMeeting(ctx(api.fetch), "123456789");
    expect(api.calls.map((c) => c.method)).toEqual(["POST", "PATCH", "DELETE"]);
  });

  it("maps rate limiting and missing links to typed errors", async () => {
    const limited = fakeApi({ [`POST ${Z}/users/me/meetings`]: () => json({}, 429) });
    await expect(zoomConferencing.createMeeting(ctx(limited.fetch), meeting)).rejects.toMatchObject({ kind: "rate_limited" });
    const empty = fakeApi({ [`POST ${Z}/users/me/meetings`]: () => json({ id: 1 }) });
    await expect(zoomConferencing.createMeeting(ctx(empty.fetch), meeting)).rejects.toMatchObject({ kind: "invalid" });
  });
});
