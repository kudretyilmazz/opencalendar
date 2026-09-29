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
