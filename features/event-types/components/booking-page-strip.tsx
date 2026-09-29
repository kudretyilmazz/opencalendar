import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { initials } from "../list-view";

const pill =
  "inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground";

/** Who the booking page belongs to, where it lives and how many event types it shows. */
export function BookingPageStrip({
  name,
  url,
  display,
  publicCount,
  hiddenCount,
}: {
  name: string;
  /** Null until the host picks a username. */
  url: string | null;
  display: string;
  publicCount: number;
  hiddenCount: number;
}) {
  return (
    <Card
      aria-label="Your booking page"
      role="region"
      className="flex-row flex-wrap items-center gap-3 px-4 py-4 md:flex-nowrap md:gap-4 md:px-5"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground"
      >
        {initials(name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{name}</span>
        {url ? (
          <span className="truncate font-mono text-[13px] text-muted-foreground">{display}</span>
        ) : (
          <span className="text-[13px] text-muted-foreground">
            <Link
              href="/settings/profile"
              className="font-medium text-highlight-text underline-offset-4 hover:underline"
            >
              Choose a username
            </Link>{" "}
            to publish your booking page.
          </span>
        )}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
        <span className={pill}>{publicCount} public</span>
        <span className={pill}>{hiddenCount} hidden</span>
        {url && (
          <Button
            asChild
            variant="outline"
            className="ml-auto h-11 rounded-md bg-transparent px-3 text-[13px] md:ml-2 md:h-9"
          >
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden className="size-3.5" />
              Preview page
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}
