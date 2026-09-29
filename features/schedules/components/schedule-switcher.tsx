import { Search } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export type SwitcherSchedule = { id: string; name: string; isDefault: boolean; line: string };

export function DefaultPill() {
  return (
    <Badge variant="muted" className="h-auto rounded-full px-2 py-px text-[11px] font-medium">
      Default
    </Badge>
  );
}

/** One card per schedule linking to its editor; the open one is outlined. */
export function ScheduleSwitcher({
  schedules,
  activeId,
}: {
  schedules: readonly SwitcherSchedule[];
  activeId: string;
}) {
  return (
    <nav aria-label="Schedules">
      <ul className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {schedules.map((s) => {
          const active = s.id === activeId;
          return (
            <li key={s.id} className="sm:min-w-[260px]">
              <Link
                href={`/availability/${s.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col gap-1 rounded-[12px] border bg-card px-4 py-3 text-foreground no-underline transition-colors hover:text-foreground",
                  active ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/60",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {s.name}
                  {s.isDefault && <DefaultPill />}
                </span>
                <span className="text-xs text-muted-foreground">{s.line}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** "Why isn't a time offered?" → the troubleshooter. */
export function TroubleshooterCard() {
  return (
    <Card className="gap-0 p-0">
      <Link
        href="/availability/troubleshoot"
        className="flex items-center gap-3 px-5 py-4 text-foreground no-underline hover:bg-muted/60 hover:text-foreground"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Search className="size-[18px]" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">Why isn’t a time offered?</span>
          <span className="text-xs text-muted-foreground">The troubleshooter explains every slot of a day.</span>
        </span>
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
      </Link>
    </Card>
  );
}
