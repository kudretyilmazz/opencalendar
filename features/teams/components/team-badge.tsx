import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

/** Marks a booking of a team event type (collective, round robin) with its team's name. */
export function TeamBadge({ name, className }: { name: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("h-auto max-w-40 gap-1 rounded-full px-2 py-0.5 text-muted-foreground", className)}>
      <Users className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">Team: </span>
      <span className="truncate">{name}</span>
    </Badge>
  );
}
