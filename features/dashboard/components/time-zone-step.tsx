"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { setTimeZoneAction } from "@/features/settings/server/actions";
import { cn } from "@/lib/cn";

/** The browser's zone, or null when it reports none or UTC (then the user picks one in Settings). */
function detectTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz !== "UTC" && tz !== "Etc/UTC" ? tz : null;
  } catch {
    return null;
  }
}

/**
 * Setup step: offers the browser's time zone as a one-click fix. The zone is only known after
 * hydration, so the first render matches the server's (no zone named yet).
 */
export function TimeZoneStep({ current, buttonClassName }: { current: boolean; buttonClassName: string }) {
  const [detected, setDetected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a browser-only value once after mount
  useEffect(() => setDetected(detectTimeZone()), []);

  const label = detected?.replaceAll("_", " ");
  return (
    <>
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <span className={cn("text-sm", current ? "font-semibold" : "font-medium")}>Set your time zone</span>
        <span className="text-[13px] text-muted-foreground">
          Invitees see your hours in their own time.{label ? ` We detected ${label}.` : ""}
        </span>
        {error && (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        )}
      </div>
      {detected ? (
        <Button
          type="button"
          variant={current ? "default" : "outline"}
          disabled={pending}
          className={cn(buttonClassName, !current && "bg-transparent")}
          onClick={() =>
            startTransition(async () => {
              const result = await setTimeZoneAction(detected);
              setError(result.status === "error" ? (result.message ?? "That didn't work.") : null);
            })
          }
        >
          {pending && <Spinner />}
          Use {label}
        </Button>
      ) : (
        <Button asChild variant={current ? "default" : "outline"} className={buttonClassName}>
          <Link href="/settings/profile">Set time zone</Link>
        </Button>
      )}
    </>
  );
}
