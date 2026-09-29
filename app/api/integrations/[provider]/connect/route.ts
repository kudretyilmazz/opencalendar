import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { getEnv } from "@/lib/env";
import { randomToken } from "@/lib/ids";
import { buildAuthorizeUrl, createPkce } from "@/lib/integrations/oauth";
import { OAUTH_COOKIE, OAUTH_STATE_TTL_MS, sealOAuthState } from "@/lib/integrations/oauth-state";
import { getProvider, isProviderConfigured, isProviderId, resolveOAuthUrls } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/** Starts the OAuth flow for a calendar/video provider (INT-002/003/009). */
export async function GET(_request: Request, ctx: RouteContext<"/api/integrations/[provider]/connect">) {
  const env = getEnv();
  const back = (error: string) => NextResponse.redirect(`${env.APP_URL}/settings/calendars?error=${error}`);
  const session = await getSession();
  if (!session) return NextResponse.redirect(`${env.APP_URL}/login?next=%2Fsettings%2Fcalendars`);
  const { provider: id } = await ctx.params;
  if (!isProviderId(id)) return back("unknown_provider");
  const provider = getProvider(id);
  const oauth = resolveOAuthUrls(provider, env);
  const client = provider.client?.(env);
  if (!oauth || !client || !isProviderConfigured(provider, env)) return back("not_configured");

  const { verifier, challenge } = createPkce();
  const state = randomToken(24);
  const url = buildAuthorizeUrl(oauth, {
    clientId: client.clientId,
    redirectUri: `${env.APP_URL}/api/integrations/${id}/callback`,
    state,
    codeChallenge: challenge,
  });
  const response = NextResponse.redirect(url);
  response.cookies.set(
    OAUTH_COOKIE,
    sealOAuthState(cipherFromEnv(env), { state, verifier, provider: id, userId: session.user.id, expiresAt: Date.now() + OAUTH_STATE_TTL_MS }),
    { httpOnly: true, secure: env.APP_URL.startsWith("https://"), sameSite: "lax", path: "/api/integrations", maxAge: OAUTH_STATE_TTL_MS / 1000 },
  );
  return response;
}
