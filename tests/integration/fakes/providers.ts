import type { FetchLike } from "@/lib/integrations/types";

/**
 * In-memory fakes of the Google Calendar, OAuth token and Zoom HTTP APIs, used by integration
 * tests through the injectable `fetchFor`. They implement just the endpoints our adapters call.
 */

type GEvent = { id: string; summary?: string; start: { dateTime: string }; end: { dateTime: string }; hangoutLink?: string; transparency?: string };

export function createFakeGoogle() {
  const calendars = [
    { id: "primary@example.com", summary: "Hana", accessRole: "owner", primary: true },
    { id: "team@example.com", summary: "Team", accessRole: "reader" },
  ];
  const events = new Map<string, GEvent[]>(calendars.map((c) => [c.id, []]));
  const stats = { eventsList: 0, tokenRefresh: 0, inserts: 0, patches: 0, deletes: 0 };
  let failNext: number | null = null;
  let revoked = false;

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fetch: FetchLike = async (raw, init = {}) => {
    const url = new URL(raw);
    const method = (init.method ?? "GET").toUpperCase();
    if (url.host === "oauth2.googleapis.com") {
      stats.tokenRefresh++;
      await new Promise((r) => setTimeout(r, 20));
      return revoked ? json({ error: "invalid_grant" }, 400) : json({ access_token: `fresh-${stats.tokenRefresh}`, expires_in: 3600 });
    }
    if (failNext !== null) {
      const status = failNext;
      failNext = null;
      return json({ error: "fail" }, status);
    }
    if (revoked) return json({ error: "unauthorized" }, 401);
    const path = decodeURIComponent(url.pathname.replace("/calendar/v3", ""));
    if (method === "GET" && path === "/users/me/calendarList") return json({ items: calendars });
    const m = /^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(path);
    if (!m) return json({ error: "not found" }, 404);
    const [, calId, eventId] = m;
    const list = events.get(calId) ?? [];
    if (method === "GET" && !eventId) {
      stats.eventsList++;
      const min = Date.parse(url.searchParams.get("timeMin")!);
      const max = Date.parse(url.searchParams.get("timeMax")!);
      return json({ items: list.filter((e) => Date.parse(e.end.dateTime) > min && Date.parse(e.start.dateTime) < max) });
    }
    if (method === "POST") {
      stats.inserts++;
      const body = JSON.parse(String(init.body)) as GEvent & { id: string; conferenceData?: unknown };
      if (list.some((e) => e.id === body.id)) return json({ error: "duplicate" }, 409);
      const ev: GEvent = { ...body, ...(body.conferenceData ? { hangoutLink: `https://meet.google.com/fake-${body.id.slice(0, 6)}` } : {}) };
      events.set(calId, [...list, ev]);
      return json(ev);
    }
    if (method === "PATCH") {
      stats.patches++;
      const body = JSON.parse(String(init.body)) as Partial<GEvent>;
      const ev = list.find((e) => e.id === eventId);
      if (!ev) return json({ error: "nf" }, 404);
      Object.assign(ev, body);
      return json(ev);
    }
    if (method === "DELETE") {
      stats.deletes++;
      if (!list.some((e) => e.id === eventId)) return new Response(null, { status: 404 });
      events.set(calId, list.filter((e) => e.id !== eventId));
      return new Response(null, { status: 204 });
    }
    if (method === "GET" && eventId) return json(list.find((e) => e.id === eventId) ?? {}, list.some((e) => e.id === eventId) ? 200 : 404);
    return json({ error: "unsupported" }, 400);
  };

  return {
    fetch,
    stats,
    events,
    addExternal(calendarId: string, id: string, start: string, end: string) {
      events.get(calendarId)!.push({ id, start: { dateTime: start }, end: { dateTime: end } });
    },
    failOnce(status: number) {
      failNext = status;
    },
    revoke() {
      revoked = true;
    },
  };
}

export function createFakeZoom() {
  const meetings = new Map<string, { start_time: string; duration: number }>();
  let next = 1000;
  const fetch: FetchLike = async (raw, init = {}) => {
    const url = new URL(raw);
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "POST" && url.pathname === "/v2/users/me/meetings") {
      const id = String(next++);
      meetings.set(id, JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: Number(id), join_url: `https://zoom.us/j/${id}` }), { status: 201 });
    }
    const m = /^\/v2\/meetings\/(\d+)$/.exec(url.pathname);
    if (m && method === "PATCH") {
      meetings.set(m[1], JSON.parse(String(init.body)));
      return new Response(null, { status: 204 });
    }
    if (m && method === "DELETE") {
      meetings.delete(m[1]);
      return new Response(null, { status: 204 });
    }
    return new Response("nf", { status: 404 });
  };
  return { fetch, meetings };
}
