import { NextResponse } from "next/server";
import { connectAccount } from "@/features/calendars/server/connections";
import { getIntegrationDeps } from "@/features/calendars/server/runtime";
import { getSession } from "@/lib/auth/session";
import { cipherFromEnv } from "@/lib/crypto/encryption";
import { getEnv } from "@/lib/env";
import { IntegrationError } from "@/lib/integrations/errors";
import { exchangeCode } from "@/lib/integrations/oauth";
import { checkOAuthState, OAUTH_COOKIE } from "@/lib/integrations/oauth-state";
import { getProvider, isProviderId, resolveOAuthUrls } from "@/lib/integrations/registry";
import { createProviderFetch } from "@/lib/integrations/safe-fetch";
import { errorSummary, logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** A malformed cookie is treated like a missing one (state check fails), never a 500. */
function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/** OAuth redirect target: verifies state, exchanges the code, stores the credential. */
export async function GET(request: Request, ctx: RouteContext<"/api/integrations/[provider]/callback">) {
  const env = getEnv();
  const { provider: id } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const done = (query: string) => {
    const response = NextResponse.redirect(`${env.APP_URL}/settings/calendars?${query}`);
    response.cookies.set(OAUTH_COOKIE, "", { path: "/api/integrations", maxAge: 0 });
    return response;
  };
  if (!isProviderId(id)) return done("error=unknown_provider");
  if (params.get("error")) return done("error=denied"); // the user declined consent

  const session = await getSession();
  const cookie = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${OAUTH_COOKIE}=`))
    ?.slice(OAUTH_COOKIE.length + 1);
  const check = checkOAuthState(cipherFromEnv(env), cookie ? safeDecode(cookie) : undefined, {
    state: params.get("state"),
    provider: id,
    userId: session?.user.id,
    now: Date.now(),
  });
  const code = params.get("code");
  if (!check.ok || !code || !session) return done("error=state");

  const provider = getProvider(id);
  const oauth = resolveOAuthUrls(provider, env);
  const client = provider.client?.(env);
  if (!oauth || !client) return done("error=not_configured");
  try {
    const fetch = createProviderFetch();
    const credential = await exchangeCode(fetch, oauth, client, {
      code,
      codeVerifier: check.state.verifier,
      redirectUri: `${env.APP_URL}/api/integrations/${id}/callback`,
      now: Date.now(),
    });
    const label = await oauth.accountLabel(fetch, credential.accessToken);
    await connectAccount(getIntegrationDeps(), { userId: session.user.id, provider, label, payload: credential });
    return done(`connected=${id}`);
  } catch (error) {
    logger.warn("integration.connect_failed", { provider: id, ...errorSummary(error) });
    return done(`error=${error instanceof IntegrationError && error.kind === "auth" ? "denied" : "connect_failed"}`);
  }
}
