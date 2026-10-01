import { count } from "drizzle-orm";
import type { Database } from "@/db/client";
import { user } from "@/db/schema";
import { resolveSignupMode } from "@/features/instance/defaults";
import { getInstanceSettings } from "@/features/instance/server/service";
import { decideSignup, type SignupMode } from "@/lib/auth/policy";
import type { Env } from "@/lib/env";
import type { SocialProvider } from "../components/auth-forms";

export function enabledSocialProviders(env: Pick<Env, "oauth">): SocialProvider[] {
  return (["google", "microsoft"] as const).filter((provider) => env.oauth[provider] !== null);
}

/** The sign-up mode in effect: the admin's choice (ADM-009), else SIGNUP_MODE. */
export async function effectiveSignupMode(db: Database, env: Pick<Env, "SIGNUP_MODE">): Promise<SignupMode> {
  return resolveSignupMode(await getInstanceSettings(db), env.SIGNUP_MODE);
}

export async function isSignupOpen(db: Database, env: Pick<Env, "SIGNUP_MODE">): Promise<boolean> {
  const [[{ value }], mode] = await Promise.all([db.select({ value: count() }).from(user), effectiveSignupMode(db, env)]);
  return decideSignup({ mode, existingUserCount: value }).allowed;
}

/** OAuth buttons to show: configured providers the admin hasn't hidden (ADM-009). */
export async function visibleSocialProviders(db: Database, env: Pick<Env, "oauth">): Promise<SocialProvider[]> {
  const settings = await getInstanceSettings(db);
  const hidden = { google: settings.oauthGoogleHidden, microsoft: settings.oauthMicrosoftHidden };
  return enabledSocialProviders(env).filter((provider) => !hidden[provider]);
}
