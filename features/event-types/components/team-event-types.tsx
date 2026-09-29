import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { initials } from "../list-view";
import type { MyTeamEventType } from "../server/list";

const KIND: Record<MyTeamEventType["schedulingType"], string> = {
  collective: "Collective",
  round_robin: "Round robin",
  managed: "Managed",
};
const MAX_AVATARS = 3;

function Hosts({ names }: { names: string[] }) {
  if (!names.length) return null;
  const extra = names.length - MAX_AVATARS;
  return (
    <span className="flex shrink-0" aria-label={`Hosts: ${names.join(", ")}`} role="img">
      {names.slice(0, MAX_AVATARS).map((n, i) => (
        <span
          key={`${n}-${i}`}
          className={cn(
            "flex size-[30px] items-center justify-center rounded-full border-2 border-card bg-muted text-[11px] font-semibold text-foreground",
            i > 0 && "-ml-2",
          )}
        >
          {initials(n)}
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-2 flex size-[30px] items-center justify-center rounded-full border-2 border-card bg-muted text-[11px] font-semibold text-muted-foreground">
          +{extra}
        </span>
      )}
    </span>
  );
}

/** Team event types from the host's teams, linking to where they can be managed. */
export function TeamEventTypes({ items }: { items: MyTeamEventType[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="team-types" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 id="team-types" className="text-base font-semibold">
          Team event types
        </h2>
        <Link
          href="/teams"
          className="flex min-h-11 items-center text-[13px] font-medium text-highlight-text hover:underline md:min-h-0"
        >
          Manage in Teams →
        </Link>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 md:gap-4">
        {items.map((et) => (
          <li key={et.id}>
            <Card className="gap-0 py-0 transition-colors hover:bg-muted/40">
              <Link
                href={et.canEdit ? `/teams/${et.teamId}/event-types/${et.id}` : `/teams/${et.teamId}`}
                className="flex items-center gap-3.5 px-4 py-4 text-foreground md:px-5"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className={cn("truncate text-sm font-semibold", !et.enabled && "text-muted-foreground")}>
                    {et.title}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[et.teamName, KIND[et.schedulingType], `${et.durationMinutes} min`, !et.enabled && "Off"]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <Hosts names={et.hosts} />
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
