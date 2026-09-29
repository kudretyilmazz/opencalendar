import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { avatarStack, initials, plural, ROLE_LABELS } from "../overview";
import type { TeamCard } from "../server/overview";

/** Card and button classes shared by the Teams pages (the design's 36px small buttons). */
export const SMALL_BUTTON_CLASS = "h-11 rounded-md px-3.5 text-[13px] md:h-9";

export function TeamLogo({ name, logoUrl, className }: { name: string; logoUrl: string | null; className?: string }) {
  const base = `flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] ${className ?? ""}`;
  if (logoUrl)
    // A team's own https logo URL (validated on save); next/image would need every host allow-listed.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="" className={`${base} object-cover`} referrerPolicy="no-referrer" />;
  return (
    <span aria-hidden className={`${base} bg-highlight text-sm font-semibold text-highlight-foreground`}>
      {initials(name)}
    </span>
  );
}

export function RolePill({ role }: { role: TeamCard["role"] }) {
  return (
    <Badge variant={role === "member" ? "outline" : "muted"} className={role === "member" ? "text-muted-foreground" : undefined}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-0.5 rounded-md bg-background px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function AvatarStack({ names }: { names: string[] }) {
  const { shown, extra } = avatarStack(names);
  return (
    <div className="flex items-center gap-2.5">
      <div aria-hidden className="flex">
        {[...shown, ...(extra ? [`+${extra}`] : [])].map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="-ml-2 flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 border-card bg-muted text-[11px] font-semibold first:ml-0"
          >
            {label}
          </span>
        ))}
      </div>
      <span className="text-[13px] text-muted-foreground">{plural(names.length, "member")}</span>
    </div>
  );
}

/** One team: logo, name, public path, role, members and this week's numbers. */
export function TeamCardView({ team }: { team: TeamCard }) {
  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center gap-3">
        <TeamLogo name={team.name} logoUrl={team.logoUrl} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate text-base font-semibold">{team.name}</h2>
          <span className="truncate font-mono text-xs text-muted-foreground">/team/{team.slug}</span>
        </div>
        <RolePill role={team.role} />
      </div>
      <AvatarStack names={team.memberNames} />
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Event types" value={team.eventTypes} />
        <Stat label="This week" value={team.weekBookings} />
        <Stat
          label="Webhooks"
          value={team.webhooks ?? <span aria-label="Visible to admins">–</span>}
        />
      </dl>
      <div className="mt-auto flex gap-2">
        <Button asChild variant="outline" className={`${SMALL_BUTTON_CLASS} flex-1 bg-card`}>
          <Link href={`/teams/${team.id}`} aria-label={`Open team ${team.name}`}>
            Open team
          </Link>
        </Button>
        <Button asChild variant="ghost" className={`${SMALL_BUTTON_CLASS} px-3 text-muted-foreground`}>
          <Link href={`/teams/${team.id}/availability`} aria-label={`Availability for ${team.name}`}>
            Availability
          </Link>
        </Button>
      </div>
    </Card>
  );
}
