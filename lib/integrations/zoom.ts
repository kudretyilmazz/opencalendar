import { ensureOk, IntegrationError } from "./errors";
import { bearer, oauthCredentialSchema } from "./oauth";
import type { ConferencingAdapter, MeetingInput, OAuthCredential, ProviderDefinition } from "./types";

/** Zoom meetings via OAuth (INT-009): one meeting per booking, updated or deleted with it. */

const API = "https://api.zoom.us/v2";
type Cred = OAuthCredential;

const body = (m: MeetingInput) => ({
  topic: m.title.slice(0, 200),
  type: 2, // scheduled
  start_time: new Date(m.start).toISOString().replace(/\.\d{3}Z$/, "Z"),
  duration: Math.max(1, Math.round((m.end - m.start) / 60_000)),
  timezone: "UTC",
  settings: { join_before_host: false, waiting_room: true },
});

export const zoomConferencing: ConferencingAdapter<Cred> = {
  async createMeeting(ctx, m) {
    const res = await ensureOk(
      await ctx.fetch(`${API}/users/me/meetings`, {
        method: "POST",
        headers: bearer(ctx.credential, { "content-type": "application/json" }),
        body: JSON.stringify(body(m)),
      }),
      "Zoom create meeting",
    );
    const json = (await res.json()) as { id?: number | string; join_url?: string };
    if (!json.id || !json.join_url) throw new IntegrationError("invalid", "Zoom returned no meeting link");
    return { meetingId: String(json.id), url: json.join_url };
  },

  async updateMeeting(ctx, meetingId, m) {
    await ensureOk(
      await ctx.fetch(`${API}/meetings/${encodeURIComponent(meetingId)}`, {
        method: "PATCH",
        headers: bearer(ctx.credential, { "content-type": "application/json" }),
        body: JSON.stringify(body(m)),
      }),
      "Zoom update meeting",
    );
  },

  async deleteMeeting(ctx, meetingId) {
    const res = await ctx.fetch(`${API}/meetings/${encodeURIComponent(meetingId)}`, { method: "DELETE", headers: bearer(ctx.credential) });
    if (res.status === 404) return;
    await ensureOk(res, "Zoom delete meeting");
  },
};

export const zoom: ProviderDefinition<Cred> = {
  id: "zoom",
  name: "Zoom",
  auth: "oauth2",
  oauth: {
    authorizeUrl: "https://zoom.us/oauth/authorize",
    tokenUrl: "https://zoom.us/oauth/token",
    scopes: ["meeting:write:meeting", "meeting:update:meeting", "meeting:delete:meeting", "user:read:user"],
    clientAuth: "basic",
    async accountLabel(fetch, accessToken) {
      const res = await ensureOk(await fetch(`${API}/users/me`, { headers: { authorization: `Bearer ${accessToken}` } }), "Zoom users/me");
      const json = (await res.json()) as { email?: string };
      return json.email ?? "Zoom account";
    },
  },
  client: (env) => env.oauth.zoom,
  configureHint: "Set ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET (a user-managed OAuth app).",
  credentialSchema: oauthCredentialSchema,
  conferencing: zoomConferencing,
};
