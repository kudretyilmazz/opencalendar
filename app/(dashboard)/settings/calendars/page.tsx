import { Plus } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { HEADER_BUTTON_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { CalendarAccounts } from "@/features/calendars/components/calendar-accounts";
import { ConnectProvider, ConnectStatus, ConnectTiles } from "@/features/calendars/components/connect-section";
import { calendarsSummary, plural } from "@/features/calendars/components/display";
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

const OAUTH_MARKS: Record<string, string> = { google: "G", microsoft: "Ms", zoom: "Zm" };

function SummaryTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] border border-border bg-card px-4 py-3.5 md:px-5 md:py-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">{children}</span>
    </div>
  );
}

export default async function CalendarsPage({ searchParams }: PageProps<"/settings/calendars">) {
  const user = await requireUser();
  const env = getEnv();
  const params = await searchParams;
  const connections = await listConnections(getDb(), user.id);
  const oauthProviders = listProviders(env).filter(({ provider }) => provider.auth === "oauth2");
  const isAdmin = user.role === "admin";
  const summary = calendarsSummary(connections);

  return (
    <ConnectProvider>
      <div className={PAGE_CLASS}>
        <PageHeader
          title="Calendars"
          description="Busy times in these calendars block your slots, and new bookings are written to one of them."
          actions={
            <Button asChild className={HEADER_BUTTON_CLASS}>
              <a href="#connect">
                <Plus aria-hidden />
                Connect a calendar
              </a>
            </Button>
          }
        />
        {typeof params.connected === "string" && (
          <Alert variant="success">
            <AlertDescription>Connected.</AlertDescription>
          </Alert>
        )}
        {typeof params.error === "string" && (
          <Alert variant="destructive">
            <AlertDescription>{ERRORS[params.error] ?? "Something went wrong."}</AlertDescription>
          </Alert>
        )}
        <ConnectStatus />

        {connections.length === 0 ? (
          <div className="rounded-[12px] border border-border bg-card p-5 text-sm text-muted-foreground">
            No calendars connected yet. Connect one below so its busy times block your slots.
          </div>
        ) : (
          <>
            <section aria-label="Summary" className="grid gap-2.5 sm:grid-cols-3 md:gap-4">
              <SummaryTile label="Checked for conflicts">{plural(summary.checked, "calendar")}</SummaryTile>
              <SummaryTile label="New bookings go to">
                {summary.destination ? <span className="truncate">{summary.destination}</span> : <span className="text-muted-foreground">Not set</span>}
              </SummaryTile>
              <SummaryTile label="Connections">
                {summary.connections}
                {summary.needsAttention > 0 && <Badge variant="warning">{summary.needsAttention} needs attention</Badge>}
              </SummaryTile>
            </section>
            <CalendarAccounts connections={connections} oauthProviders={oauthProviders.map(({ provider }) => provider.id)} />
          </>
        )}

        <section id="connect" aria-labelledby="connect-title" className="flex scroll-mt-6 flex-col gap-3">
          <h2 id="connect-title" className="text-base font-semibold">
            {connections.length === 0 ? "Connect a calendar" : "Connect another calendar"}
          </h2>
          <ConnectTiles
            oauth={oauthProviders
              .filter(({ configured }) => configured)
              .map(({ provider }) => ({ id: provider.id, name: provider.name, mark: OAUTH_MARKS[provider.id] ?? provider.name.slice(0, 2) }))}
          />
          {isAdmin &&
            oauthProviders
              .filter(({ configured }) => !configured)
              .map(({ provider }) => (
                <p key={provider.id} className="text-xs text-muted-foreground">
                  <strong>{provider.name}</strong> is hidden because it isn&apos;t configured. {provider.configureHint}
                </p>
              ))}
        </section>
      </div>
    </ConnectProvider>
  );
}
