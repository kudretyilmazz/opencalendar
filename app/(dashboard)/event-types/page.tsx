import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Button, Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import {
  deleteEventTypeAction,
  duplicateEventTypeAction,
  moveEventTypeAction,
  toggleEventTypeAction,
} from "@/features/event-types/server/actions";
import { durationsOf, listEventTypes } from "@/features/event-types/server/service";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { formatDuration } from "@/lib/format";

export const metadata: Metadata = { title: "Event types" };

export default async function EventTypesPage({ searchParams }: PageProps<"/event-types">) {
  const user = await requireUser();
  const { error } = await searchParams;
  const eventTypes = await listEventTypes(getDb(), user.id);
  const profileUrl = user.username ? `${getEnv().APP_URL}/${user.username}` : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Event types</h1>
          <p className="text-sm text-muted">
            {profileUrl ? (
              <>
                Your booking page:{" "}
                <a href={profileUrl} className="font-medium text-foreground underline-offset-4 hover:underline">
                  {profileUrl}
                </a>
              </>
            ) : (
              "Create the kinds of meetings people can book with you."
            )}
          </p>
        </div>
        <Link href="/event-types/new" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          New event type
        </Link>
      </div>
      {typeof error === "string" && <Alert tone="error">{error.slice(0, 200)}</Alert>}
      {!user.username && (
        <Alert>
          <Link href="/settings/profile" className="font-medium underline">
            Choose a username
          </Link>{" "}
          to publish your booking page.
        </Alert>
      )}
      {!user.emailVerified && <Alert tone="error">Verify your email address to publish your booking page.</Alert>}
      {eventTypes.length === 0 ? (
        <Card className="text-sm text-muted">No event types yet. Create your first one to start taking bookings.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {eventTypes.map((et, i) => (
            <li key={et.id}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className={et.enabled ? "" : "opacity-60"}>
                  <Link href={`/event-types/${et.id}`} className="font-medium underline-offset-4 hover:underline">
                    {et.title}
                  </Link>
                  {et.hidden && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs">Hidden</span>}
                  {!et.enabled && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs">Off</span>}
                  <p className="text-sm text-muted">
                    {durationsOf(et).map((d) => formatDuration(d, "en")).join(" / ")} · /{user.username ?? "username"}/{et.slug}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <form action={moveEventTypeAction.bind(null, et.id, "up")}>
                    <Button variant="ghost" className="h-9 px-2" aria-label={`Move ${et.title} up`} disabled={i === 0}>
                      ↑
                    </Button>
                  </form>
                  <form action={moveEventTypeAction.bind(null, et.id, "down")}>
                    <Button variant="ghost" className="h-9 px-2" aria-label={`Move ${et.title} down`} disabled={i === eventTypes.length - 1}>
                      ↓
                    </Button>
                  </form>
                  <form action={toggleEventTypeAction.bind(null, et.id, !et.enabled)}>
                    <Button variant="secondary" className="h-9">
                      {et.enabled ? "Turn off" : "Turn on"}
                    </Button>
                  </form>
                  <form action={duplicateEventTypeAction.bind(null, et.id)}>
                    <Button variant="secondary" className="h-9">
                      Duplicate
                    </Button>
                  </form>
                  <form action={deleteEventTypeAction.bind(null, et.id)}>
                    <Button variant="ghost" className="h-9" aria-label={`Delete ${et.title}`}>
                      Delete
                    </Button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
