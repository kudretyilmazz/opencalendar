import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, createPkce, exchangeCode, needsRefresh, refreshAccessToken } from "./oauth";
import type { OAuthConfig } from "./types";

const config: OAuthConfig = {
  authorizeUrl: "https://auth.example.com/authorize",
  tokenUrl: "https://auth.example.com/token",
  scopes: ["a", "b"],
  authorizeParams: { access_type: "offline" },
  clientAuth: "body",
  accountLabel: async () => "x",
};
const client = { clientId: "cid", clientSecret: "secret" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("oauth", () => {
  it("creates a valid S256 PKCE pair", () => {
    const { verifier, challenge } = createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("builds the authorize URL with state, PKCE and extra params", () => {
    const url = new URL(buildAuthorizeUrl(config, { clientId: "cid", redirectUri: "https://app/cb", state: "st", codeChallenge: "ch" }));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "cid",
      redirect_uri: "https://app/cb",
      scope: "a b",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
      access_type: "offline",
    });
  });

  it("exchanges a code with client credentials in the body", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(Object.fromEntries(body)).toMatchObject({ grant_type: "authorization_code", code: "c", code_verifier: "v", client_id: "cid", client_secret: "secret" });
      return json({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
    });
    const cred = await exchangeCode(fetch, config, client, { code: "c", codeVerifier: "v", redirectUri: "https://app/cb", now: 1000 });
    expect(cred).toEqual({ accessToken: "at", refreshToken: "rt", expiresAt: 1000 + 3_600_000, scope: undefined });
  });

  it("uses HTTP Basic client auth when configured (Zoom)", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("cid:secret").toString("base64")}`);
      expect(String(init?.body)).not.toContain("client_secret");
      return json({ access_token: "at", expires_in: 60 });
    });
    await exchangeCode(fetch, { ...config, clientAuth: "basic" }, client, { code: "c", codeVerifier: "v", redirectUri: "r", now: 0 });
  });

  it("refreshes, keeping the old refresh token when none is rotated", async () => {
    const fetch = vi.fn(async () => json({ access_token: "new", expires_in: 100 }));
    const next = await refreshAccessToken(fetch, config, client, { accessToken: "old", refreshToken: "rt", expiresAt: 0 }, 5000);
    expect(next).toMatchObject({ accessToken: "new", refreshToken: "rt", expiresAt: 5000 + 100_000 });
  });

  it("maps invalid_grant to an auth error (reconnect needed)", async () => {
    const fetch = vi.fn(async () => json({ error: "invalid_grant" }, 400));
    await expect(refreshAccessToken(fetch, config, client, { accessToken: "a", refreshToken: "r", expiresAt: 0 }, 0)).rejects.toMatchObject({ kind: "auth" });
    await expect(refreshAccessToken(fetch, config, client, { accessToken: "a", expiresAt: 0 }, 0)).rejects.toMatchObject({ kind: "auth" });
  });

  it("knows when a token needs refreshing", () => {
    expect(needsRefresh({ accessToken: "a", expiresAt: 100_000 }, 30_000)).toBe(false);
    expect(needsRefresh({ accessToken: "a", expiresAt: 100_000 }, 50_000)).toBe(true);
  });
});
