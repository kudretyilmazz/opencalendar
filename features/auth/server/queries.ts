import { count } from "drizzle-orm";
import type { Database } from "@/db/client";
import { user } from "@/db/schema";
import { decideSignup } from "@/lib/auth/policy";
import type { Env } from "@/lib/env";
import type { SocialProvider } from "../components/auth-forms";

export function enabledSocialProviders(env: Pick<Env, "oauth">): SocialProvider[] {
  return (["google", "microsoft"] as const).filter((provider) => env.oauth[provider] !== null);
}

export async function isSignupOpen(db: Database, env: Pick<Env, "SIGNUP_MODE">): Promise<boolean> {
  const [{ value }] = await db.select({ value: count() }).from(user);
  return decideSignup({ mode: env.SIGNUP_MODE, existingUserCount: value }).allowed;
}
