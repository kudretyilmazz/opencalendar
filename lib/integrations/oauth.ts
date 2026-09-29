import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { IntegrationError, kindForStatus } from "./errors";
import type { FetchLike, OAuthConfig, OAuthCredential } from "./types";

/** OAuth 2.0 authorization code flow with PKCE, shared by Google, Microsoft and Zoom. */

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function buildAuthorizeUrl(
  config: OAuthConfig,
  params: { clientId: string; redirectUri: string; state: string; codeChallenge: string },
): string {
  const url = new URL(config.authorizeUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: config.scopes.join(" "),
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    ...config.authorizeParams,
  }).toString();
  return url.toString();
}

const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.coerce.number().positive().optional(),
  scope: z.string().optional(),
});

type Client = { clientId: string; clientSecret: string };

async function tokenRequest(fetch: FetchLike, config: OAuthConfig, client: Client, form: Record<string, string>) {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  const body = new URLSearchParams(form);
  if (config.clientAuth === "basic") {
    headers.authorization = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", client.clientId);
    body.set("client_secret", client.clientSecret);
  }
  const res = await fetch(config.tokenUrl, { method: "POST", headers, body });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    // invalid_grant = refresh token revoked/expired: the user must reconnect (INT-012).
    const kind = json.error === "invalid_grant" ? "auth" : kindForStatus(res.status);
    throw new IntegrationError(kind, `Token request failed (${json.error ?? res.status})`, res.status);
  }
  const parsed = tokenResponse.safeParse(json);
  if (!parsed.success) throw new IntegrationError("invalid", "Unexpected token response");
  return parsed.data;
}

export async function exchangeCode(
  fetch: FetchLike,
  config: OAuthConfig,
  client: Client,
  params: { code: string; codeVerifier: string; redirectUri: string; now: number },
): Promise<OAuthCredential> {
  const t = await tokenRequest(fetch, config, client, {
    grant_type: "authorization_code",
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: params.now + (t.expires_in ?? 3600) * 1000,
    scope: t.scope,
  };
}

export async function refreshAccessToken(
  fetch: FetchLike,
  config: OAuthConfig,
  client: Client,
  credential: OAuthCredential,
  now: number,
): Promise<OAuthCredential> {
  if (!credential.refreshToken) throw new IntegrationError("auth", "No refresh token; reconnect the account");
  const t = await tokenRequest(fetch, config, client, { grant_type: "refresh_token", refresh_token: credential.refreshToken });
  return {
    accessToken: t.access_token,
    // Providers may rotate refresh tokens; keep the old one if none is returned.
    refreshToken: t.refresh_token ?? credential.refreshToken,
    expiresAt: now + (t.expires_in ?? 3600) * 1000,
    scope: t.scope ?? credential.scope,
  };
}

/** Refresh when the access token expires within this margin. */
export const REFRESH_MARGIN_MS = 60_000;

export const needsRefresh = (credential: OAuthCredential, now: number) => credential.expiresAt - REFRESH_MARGIN_MS <= now;

export const oauthCredentialSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expiresAt: z.number(),
  scope: z.string().optional(),
});

/** Bearer-authenticated JSON request helper for OAuth providers. */
export function bearer(credential: OAuthCredential, extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${credential.accessToken}`, accept: "application/json", ...extra };
}
