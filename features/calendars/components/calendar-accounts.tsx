"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { Rss } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import type { ConnectionView } from "../server/connections";
import { setDestinationAction, toggleConflictAction } from "../server/actions";
import { type ConnectTarget, logoClass, useConnect } from "./connect-section";
import { DisconnectButton } from "./disconnect-button";
import { accountDisplay } from "./display";

type Calendar = ConnectionView["calendars"][number];
type Change = { type: "conflict"; id: string; enabled: boolean } | { type: "destination"; id: string };

function applyChange(connections: ConnectionView[], change: Change): ConnectionView[] {
  return connections.map((conn) => ({
    ...conn,
    calendars: conn.calendars.map((cal) =>
      change.type === "conflict"
        ? cal.id === change.id
          ? { ...cal, checkConflicts: change.enabled }
          : cal
        : { ...cal, isDestination: cal.id === change.id },
    ),
  }));
}

const PRESET_BY_TITLE: Record<string, ConnectTarget> = {
  iCloud: { kind: "caldav", preset: "icloud" },
  Fastmail: { kind: "caldav", preset: "fastmail" },
  Nextcloud: { kind: "caldav", preset: "nextcloud" },
};

const GRID = "grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-3 px-4 md:grid-cols-[minmax(0,1fr)_200px_200px] md:gap-4 md:px-5";
const cardClass = "overflow-hidden rounded-[12px] border border-border bg-card";

type Handlers = {
  onConflict: (cal: Calendar, enabled: boolean) => void;
  onDestination: (id: string) => void;
};

function ConflictSwitch({ cal, onConflict }: { cal: Calendar; onConflict: Handlers["onConflict"] }) {
  return (
    <Switch
      checked={cal.checkConflicts}
      onCheckedChange={(enabled) => onConflict(cal, enabled)}
      aria-label={`Check ${cal.name} for conflicts`}
      className="after:-inset-3"
    />
  );
}

function ColorDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className={cn("size-2.5 shrink-0 rounded-[3px]", !color && "border border-input")}
      // Provider-supplied calendar colour (data, not a design token).
      style={color ? { background: color } : undefined}
    />
  );
}

function CalendarTable({ calendars, onConflict, onDestination }: { calendars: Calendar[] } & Handlers) {
  const destination = calendars.find((c) => c.isDestination)?.id ?? "";
  return (
    <>
      <div className={cn(GRID, "h-9 border-y border-border bg-background text-xs font-medium text-muted-foreground")}>
        <span>Calendar</span>
        <span>
          <span className="md:hidden">Conflicts</span>
          <span className="hidden md:inline">Check for conflicts</span>
        </span>
        <span>
          <span className="md:hidden">Bookings</span>
          <span className="hidden md:inline">Add new bookings here</span>
        </span>
      </div>
      <RadioGroupPrimitive.Root value={destination} onValueChange={onDestination} aria-label="Add new bookings here" className="divide-y divide-border">
        {calendars.map((cal) => (
          <div key={cal.id} className={cn(GRID, "min-h-[52px] py-2 text-sm md:py-0")}>
            <span className={cn("flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1", cal.readOnly && "text-muted-foreground")}>
              <ColorDot color={cal.color} />
              <span className="min-w-0 truncate">{cal.name}</span>
              {cal.isDestination && <Badge variant="muted">Destination</Badge>}
              {cal.readOnly && (
                <Badge variant="outline" className="text-muted-foreground">
                  Read-only
                </Badge>
              )}
            </span>
            <span>
              <ConflictSwitch cal={cal} onConflict={onConflict} />
            </span>
            <span>
              {cal.readOnly ? (
                <span className="text-xs text-muted-foreground" aria-label="Read-only: bookings can't be added">
                  —
                </span>
              ) : (
                <RadioGroupPrimitive.Item
                  value={cal.id}
                  aria-label={`Add new bookings to ${cal.name}`}
                  className="relative flex size-[18px] items-center justify-center rounded-full border-2 border-input outline-none after:absolute after:-inset-3 focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:border-primary"
                >
                  <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-primary" />
                </RadioGroupPrimitive.Item>
              )}
            </span>
          </div>
        ))}
      </RadioGroupPrimitive.Root>
    </>
  );
}

function Reconnect({ conn, target }: { conn: ConnectionView; target: ConnectTarget | "oauth" }) {
  const { open } = useConnect();
  const className = "h-9 rounded-md px-3.5 text-[13px]";
  if (target === "oauth") {
    return (
      <Button asChild className={className}>
        <a href={`/api/integrations/${conn.provider}/connect`}>Reconnect</a>
      </Button>
    );
  }
  return (
    <Button type="button" className={className} aria-haspopup="dialog" onClick={() => open(target)}>
      Reconnect
    </Button>
  );
}

function StatusIndicator({ invalid }: { invalid: boolean }) {
  if (invalid) return <Badge variant="warning">Needs attention</Badge>;
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-success">
      <span aria-hidden className="size-2 rounded-full bg-success" />
      Connected
    </span>
  );
}

function BrokenNotice({ conn }: { conn: ConnectionView }) {
  const names = conn.calendars.map((c) => `“${c.name}”`).join(", ");
  return (
    <p className="bg-warning px-4 py-3 text-[13px] text-warning-foreground md:px-5">
      This connection stopped working{conn.lastError ? ` (${conn.lastError})` : ""}. Bookings still work, but until you reconnect,{" "}
      {names ? `busy times in ${names} aren't checked and nothing is written there.` : "this account isn't checked or updated."}
    </p>
  );
}

function AccountCard({ conn, reconnect, ...handlers }: { conn: ConnectionView; reconnect: ConnectTarget | "oauth" } & Handlers) {
  const display = accountDisplay(conn);
  const headingId = `account-${conn.id}`;
  return (
    <section aria-labelledby={headingId} className={cn(cardClass, conn.invalid && "border-warning-border")}>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 p-4 md:px-5 md:py-[18px]">
        <span className={logoClass} aria-hidden>
          {display.mark}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={headingId} className="truncate text-base font-semibold">
            {display.title}
          </h2>
          <span className="truncate text-[13px] text-muted-foreground">{display.subtitle}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusIndicator invalid={conn.invalid} />
          {conn.invalid && <Reconnect conn={conn} target={reconnect} />}
          <DisconnectButton credentialId={conn.id} name={display.title} />
        </div>
      </div>
      {conn.invalid ? <BrokenNotice conn={conn} /> : conn.calendars.length > 0 && <CalendarTable calendars={conn.calendars} {...handlers} />}
    </section>
  );
}

function FeedCard({ conn, onConflict }: { conn: ConnectionView; onConflict: Handlers["onConflict"] }) {
  const display = accountDisplay(conn);
  const headingId = `account-${conn.id}`;
  const cal = conn.calendars[0];
  return (
    <section aria-labelledby={headingId} className={cn(cardClass, conn.invalid && "border-warning-border")}>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 p-4 md:px-5 md:py-[18px]">
        <span className={logoClass} aria-hidden>
          <Rss className="size-[18px]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={headingId} className="truncate text-base font-semibold">
            {display.title}
          </h2>
          <span className="truncate font-mono text-xs text-muted-foreground">{display.subtitle}</span>
        </div>
        <div className="flex items-center gap-3">
          {conn.invalid ? (
            <>
              <Badge variant="warning">Needs attention</Badge>
              <Reconnect conn={conn} target={{ kind: "feed" }} />
            </>
          ) : (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline">Calendar feed</span>
              {cal && <ConflictSwitch cal={cal} onConflict={onConflict} />}
            </>
          )}
          <DisconnectButton credentialId={conn.id} name={display.title} />
        </div>
      </div>
      {conn.invalid && <BrokenNotice conn={conn} />}
    </section>
  );
}

/**
 * Connected accounts (a calendar table each) and ICS feeds. Switches and destination radios
 * update optimistically and call the existing server actions.
 */
export function CalendarAccounts({ connections, oauthProviders }: { connections: ConnectionView[]; oauthProviders: string[] }) {
  const [optimistic, addChange] = useOptimistic(connections, applyChange);
  const [, startTransition] = useTransition();

  const handlers: Handlers = {
    onConflict: (cal, enabled) =>
      startTransition(async () => {
        addChange({ type: "conflict", id: cal.id, enabled });
        await toggleConflictAction(cal.id, enabled);
      }),
    onDestination: (id) =>
      startTransition(async () => {
        addChange({ type: "destination", id });
        await setDestinationAction(id);
      }),
  };

  const reconnectFor = (conn: ConnectionView): ConnectTarget | "oauth" =>
    oauthProviders.includes(conn.provider) ? "oauth" : (PRESET_BY_TITLE[accountDisplay(conn).title] ?? { kind: "caldav", preset: "other" });

  // Accounts first, then feeds (as in the design).
  return (
    <>
      {optimistic
        .filter((conn) => conn.provider !== "ics_feed")
        .map((conn) => (
          <AccountCard key={conn.id} conn={conn} reconnect={reconnectFor(conn)} {...handlers} />
        ))}
      {optimistic
        .filter((conn) => conn.provider === "ics_feed")
        .map((conn) => (
          <FeedCard key={conn.id} conn={conn} onConflict={handlers.onConflict} />
        ))}
    </>
  );
}
