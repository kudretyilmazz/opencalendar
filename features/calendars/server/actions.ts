"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { ActionState } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { IntegrationError } from "@/lib/integrations/errors";
import { ICS_FEED_CALENDAR_ID } from "@/lib/integrations/caldav";
import { getProvider } from "@/lib/integrations/registry";
import { ConnectionError, connectAccount, disconnectAccount, setConflictCheck, setDestination } from "./connections";
import { getIntegrationDeps } from "./runtime";

const MESSAGES: Record<string, string> = {
  auth: "The server rejected these credentials. Check the username and (app-specific) password.",
  invalid: "That address can't be used. Check the URL (private network addresses are blocked).",
  not_found: "Nothing was found at that address. Check the URL.",
  transient: "The server didn't respond. Try again in a moment.",
  rate_limited: "The server is rate limiting requests. Try again in a moment.",
};

function integrationFailure(error: unknown): ActionState {
  if (error instanceof IntegrationError) return { status: "error", message: MESSAGES[error.kind] ?? "Connection failed." };
  if (error instanceof ConnectionError && error.code === "NO_CALENDARS") return { status: "error", message: "No calendars were found for this account." };
  throw error;
}

/** Distinguishes accounts on the same host (different paths or feeds) without storing secrets. */
const shortHash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 8);

const caldavSchema = z.object({
  serverUrl: z.string().trim().url("Enter the server URL"),
  username: z.string().trim().min(1, "Enter the username").max(200),
  password: z.string().min(1, "Enter the password").max(500),
});

/** Connect a CalDAV account (INT-004): verified by listing its calendars before saving. */
export async function connectCaldavAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = caldavSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const server = new URL(parsed.data.serverUrl);
  // Basic auth over plain HTTP would expose the password; only LAN installs may opt out.
  if (server.protocol !== "https:" && !getEnv().ALLOW_PRIVATE_NETWORK_INTEGRATIONS) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { serverUrl: "Use an https:// address" } };
  }
  try {
    const label = `${parsed.data.username}@${server.host} · ${shortHash(`${server.origin}${server.pathname}`)}`;
    await connectAccount(getIntegrationDeps(), { userId: user.id, provider: getProvider("caldav"), label, payload: parsed.data });
  } catch (error) {
    return integrationFailure(error);
  }
  revalidatePath("/settings/calendars");
  return { status: "success", message: "Calendar connected." };
}

const icsSchema = z.object({ url: z.string().trim().url("Enter the feed URL").max(2048) });

/** Subscribe to a read-only ICS feed for conflict checking (INT-005). */
export async function connectIcsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const raw = String(formData.get("url") ?? "").replace(/^webcal:\/\//i, "https://");
  const parsed = icsSchema.safeParse({ url: raw });
  if (!parsed.success) return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { url: parsed.error.issues[0].message } };
  try {
    const deps = getIntegrationDeps();
    // Validate that the URL really is a calendar before saving it.
    const provider = getProvider("ics_feed");
    await provider.calendar!.getBusy(
      { credential: parsed.data, fetch: deps.fetchFor(provider), saveCredential: async () => undefined },
      [ICS_FEED_CALENDAR_ID],
      { start: Date.now(), end: Date.now() + 86_400_000, timeZone: user.timeZone ?? "UTC" },
    );
    const label = `${new URL(parsed.data.url).hostname} · ${shortHash(parsed.data.url)}`;
    await connectAccount(deps, { userId: user.id, provider, label, payload: parsed.data });
  } catch (error) {
    return integrationFailure(error);
  }
  revalidatePath("/settings/calendars");
  return { status: "success", message: "Feed added." };
}

export async function toggleConflictAction(calendarId: string, enabled: boolean): Promise<void> {
  const user = await requireUser();
  await setConflictCheck(getDb(), user.id, calendarId, enabled).catch((e) => {
    if (!(e instanceof ConnectionError)) throw e;
  });
  revalidatePath("/settings/calendars");
}

export async function setDestinationAction(calendarId: string): Promise<void> {
  const user = await requireUser();
  await setDestination(getDb(), user.id, calendarId).catch((e) => {
    if (!(e instanceof ConnectionError)) throw e;
  });
  revalidatePath("/settings/calendars");
}

export async function disconnectAction(credentialId: string): Promise<void> {
  const user = await requireUser();
  await disconnectAccount(getDb(), user.id, credentialId).catch((e) => {
    if (!(e instanceof ConnectionError)) throw e;
  });
  revalidatePath("/settings/calendars");
}
