import type { Metadata } from "next";
import { Alert, Button, Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { CaldavForm, IcsFeedForm } from "@/features/calendars/components/connect-forms";
import { disconnectAction, setDestinationAction, toggleConflictAction } from "@/features/calendars/server/actions";
import { listConnections } from "@/features/calendars/server/connections";
import { requireUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { listProviders } from "@/lib/integrations/registry";

export const metadata: Metadata = { title: "Calendars" };

const ERRORS: Record<string, string> = {
  denied: "The connection was not authorized. Try again and accept the requested permissions.",
  state: "The sign-in took too long or came from another session. Please try again.",
  not_configured: "This provider isn't configured on this instance.",
  connect_failed: "Connecting failed. Please try again.",
  unknown_provider: "Unknown provider.",
};

export default async function CalendarsPage({ searchParams }: PageProps<"/settings/calendars">) {
  const user = await requireUser();
  const env = getEnv();
  const params = await searchParams;
  const connections = await listConnections(getDb(), user.id);
  const oauthProviders = listProviders(env).filter(({ provider }) => provider.auth === "oauth2");
  const isAdmin = user.role === "admin";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Calendars</h1>
        <p className="text-sm text-muted">Connected calendars block your availability, and new bookings are added to your destination calendar.</p>
      </div>
      {typeof params.connected === "string" && <Alert tone="success">Connected.</Alert>}
      {typeof params.error === "string" && <Alert tone="error">{ERRORS[params.error] ?? "Something went wrong."}</Alert>}

      {connections.length === 0 ? (
        <Card className="text-sm text-muted">No calendars connected yet.</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {connections.map((conn) => (
            <li key={conn.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{conn.providerName}</p>
                    <p className="text-sm text-muted">{conn.label}</p>
                  </div>
                  <div className="flex gap-2">
                    {conn.invalid && ["google", "microsoft", "zoom"].includes(conn.provider) && (
                      <a href={`/api/integrations/${conn.provider}/connect`} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
                        Reconnect
                      </a>
                    )}
                    <form action={disconnectAction.bind(null, conn.id)}>
                      <Button type="submit" variant="ghost" className="h-9" aria-label={`Disconnect ${conn.label}`}>
                        Disconnect
                      </Button>
                    </form>
                  </div>
                </div>
                {conn.invalid && (
                  <Alert tone="error">
                    This connection stopped working{conn.lastError ? ` (${conn.lastError})` : ""}. Bookings still work, but this calendar isn&apos;t
                    checked or updated until you reconnect it.
                  </Alert>
                )}
                {conn.calendars.length > 0 && (
                  <ul className="flex flex-col divide-y divide-border">
                    {conn.calendars.map((cal) => (
                      <li key={cal.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span aria-hidden className="size-2.5 rounded-full border border-border" style={{ background: cal.color ?? "transparent" }} />
                          {cal.name}
                          {cal.readOnly && <span className="rounded bg-accent px-1.5 text-xs">read-only</span>}
                          {cal.isDestination && <span className="rounded bg-primary px-1.5 text-xs text-primary-foreground">destination</span>}
                        </span>
                        <span className="flex gap-2">
                          <form action={toggleConflictAction.bind(null, cal.id, !cal.checkConflicts)}>
                            <Button type="submit" variant="secondary" className="h-8" aria-pressed={cal.checkConflicts} aria-label={`Check ${cal.name} for conflicts`}>
                              {cal.checkConflicts ? "✓ Checks conflicts" : "Check conflicts"}
                            </Button>
                          </form>
                          {!cal.readOnly && !cal.isDestination && (
                            <form action={setDestinationAction.bind(null, cal.id)}>
                              <Button type="submit" variant="ghost" className="h-8" aria-label={`Add new bookings to ${cal.name}`}>
                                Use for new bookings
                              </Button>
                            </form>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Connect an account</h2>
        <div className="flex flex-wrap gap-2">
          {oauthProviders
            .filter(({ configured }) => configured)
            .map(({ provider }) => (
              <a key={provider.id} href={`/api/integrations/${provider.id}/connect`} className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-accent">
                Connect {provider.name}
              </a>
            ))}
        </div>
        {isAdmin &&
          oauthProviders
            .filter(({ configured }) => !configured)
            .map(({ provider }) => (
              <p key={provider.id} className="text-xs text-muted">
                <strong>{provider.name}</strong> is hidden because it isn&apos;t configured. {provider.configureHint}
              </p>
            ))}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">CalDAV (iCloud, Fastmail, Nextcloud…)</h2>
        <CaldavForm />
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Calendar feed</h2>
        <IcsFeedForm />
      </Card>
    </div>
  );
}
