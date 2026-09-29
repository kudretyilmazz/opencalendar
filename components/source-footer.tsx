import { getEnv } from "@/lib/env";

/**
 * AGPL-3.0 §13: everyone using the service over the network is offered the source code. The link
 * points at SOURCE_URL, so operators who modify OpenCalendar point it at their own fork.
 */
export function SourceFooter() {
  return (
    <footer className="px-4 py-3 text-center text-xs text-muted-foreground">
      Powered by OpenCalendar ·{" "}
      <a href={getEnv().SOURCE_URL} className="underline underline-offset-4" rel="noopener">
        Source code (AGPL-3.0)
      </a>
    </footer>
  );
}
