"use client";

import { Rss } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CaldavForm, IcsFeedForm, type PresetKey } from "./connect-forms";

/** What a connect dialog opens: a CalDAV preset, or the ICS feed form. */
export type ConnectTarget = { kind: "caldav"; preset: PresetKey } | { kind: "feed" };

type ConnectContextValue = {
  open: (target: ConnectTarget) => void;
  /** Message of the last successful connect, shown at the top of the page. */
  message: string | null;
};

const ConnectContext = createContext<ConnectContextValue | null>(null);

export function useConnect(): ConnectContextValue {
  const value = useContext(ConnectContext);
  if (!value) throw new Error("useConnect must be used inside <ConnectProvider>");
  return value;
}

/** Owns the connect dialog, so tiles and "Reconnect" buttons anywhere on the page can open it. */
export function ConnectProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ConnectTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const open = useCallback((next: ConnectTarget) => {
    setMessage(null);
    setTarget(next);
  }, []);
  // Closing the dialog on success lets the refreshed list (behind it) take focus and be read.
  const connected = useCallback((text: string) => {
    setMessage(text);
    setTarget(null);
  }, []);
  const value = useMemo(() => ({ open, message }), [open, message]);

  return (
    <ConnectContext.Provider value={value}>
      {children}
      <Dialog open={target !== null} onOpenChange={(isOpen) => !isOpen && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {target?.kind === "caldav" && (
            <>
              <DialogHeader>
                <DialogTitle>Connect a CalDAV calendar</DialogTitle>
                <DialogDescription>iCloud, Fastmail, Nextcloud or any CalDAV server. Busy times block your slots; bookings are written back.</DialogDescription>
              </DialogHeader>
              <CaldavForm key={target.preset} initialPreset={target.preset} onConnected={connected} />
            </>
          )}
          {target?.kind === "feed" && (
            <>
              <DialogHeader>
                <DialogTitle>Add a calendar feed</DialogTitle>
                <DialogDescription>Any ICS or webcal link. Read-only: its events block your availability.</DialogDescription>
              </DialogHeader>
              <IcsFeedForm onConnected={connected} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </ConnectContext.Provider>
  );
}

/** Success message of the last connect ("Calendar connected.", "Feed added."). */
export function ConnectStatus() {
  const { message } = useConnect();
  if (!message) return null;
  return (
    <Alert variant="success">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export const logoClass = "flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-muted text-[13px] font-semibold text-foreground";
export const tileClass =
  "flex min-h-11 flex-col items-start gap-2 rounded-[12px] border border-border bg-card p-4 text-left text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50";

const TILES: { label: string; hint: string; mark: ReactNode; target: ConnectTarget }[] = [
  { label: "iCloud", hint: "App-specific password", mark: "iC", target: { kind: "caldav", preset: "icloud" } },
  { label: "Fastmail", hint: "CalDAV", mark: "Fm", target: { kind: "caldav", preset: "fastmail" } },
  { label: "Nextcloud", hint: "CalDAV", mark: "Nc", target: { kind: "caldav", preset: "nextcloud" } },
  { label: "Other CalDAV", hint: "Any server URL", mark: "Dv", target: { kind: "caldav", preset: "other" } },
  { label: "Calendar feed", hint: "ICS link, read-only", mark: <Rss className="size-[18px]" aria-hidden />, target: { kind: "feed" } },
];

function TileBody({ label, hint, mark }: { label: string; hint: string; mark: ReactNode }) {
  return (
    <>
      <span className={logoClass} aria-hidden>
        {mark}
      </span>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </>
  );
}

/** The "Connect another calendar" tiles: OAuth providers link out, the rest open a dialog. */
export function ConnectTiles({ oauth }: { oauth: { id: string; name: string; mark: string }[] }) {
  const { open } = useConnect();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {oauth.map((provider) => (
        <a key={provider.id} href={`/api/integrations/${provider.id}/connect`} aria-label={`Connect ${provider.name}`} className={tileClass}>
          <TileBody label={provider.name} hint="Sign in" mark={provider.mark} />
        </a>
      ))}
      {TILES.map((tile) => (
        <button key={tile.label} type="button" aria-haspopup="dialog" onClick={() => open(tile.target)} className={tileClass}>
          <TileBody {...tile} />
        </button>
      ))}
    </div>
  );
}
