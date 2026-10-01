import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./server";

export type SessionData = NonNullable<Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>>;
export type SessionUser = SessionData["user"];

/** Current session or null. Deduplicated per request. */
export const getSession = cache(async (): Promise<SessionData | null> => {
  return getAuth().api.getSession({ headers: await headers() });
});

/**
 * Use at the top of every protected page, Server Action and route handler (ADR-0004):
 * authentication here, ownership/role checks right after in the caller.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.disabledAt) redirect("/login?error=disabled");
  return session.user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

/**
 * For admin Server Actions: the admin user, or null so the action can return an error state
 * instead of redirecting mid-submit. The role comes from the session row's user, which is
 * re-read on every request (no cookie cache), so a demotion takes effect immediately.
 */
export async function requireAdminAction(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session || session.user.disabledAt || session.user.role !== "admin") return null;
  return session.user;
}
