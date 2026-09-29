import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { initials, plural, ROLE_LABELS } from "../overview";
import type { MemberActivity } from "../server/overview";
import { RolePill, SMALL_BUTTON_CLASS } from "./team-cards";

const todayText = (n: number) => (n === 0 ? "No meetings" : plural(n, "meeting"));

/**
 * One team's members with how busy they are (accepted bookings today and this week). On phones
 * the role and counts move under the name instead of into columns.
 */
export function MembersTable({ teamId, teamName, members }: { teamId: string; teamName: string; members: MemberActivity[] }) {
  return (
    <Card aria-labelledby="team-members-heading" role="region" className="gap-0 py-0">
      <div className="flex items-center justify-between gap-3 px-4 py-4 md:px-5 md:py-[18px]">
        <h2 id="team-members-heading" className="text-base font-semibold">
          {teamName} members
        </h2>
        <Button asChild variant="outline" className={`${SMALL_BUTTON_CLASS} bg-card`}>
          <Link href={`/teams/${teamId}#invite`} aria-label={`Invite people to ${teamName}`}>
            <Plus aria-hidden className="size-3.5" />
            Invite
          </Link>
        </Button>
      </div>
      <Table className="table-fixed">
        <TableHeader className="bg-background">
          <TableRow className="border-y border-border hover:bg-transparent">
            <TableHead scope="col" className="h-9 px-4 text-xs font-medium text-muted-foreground md:px-5">
              Member
            </TableHead>
            <TableHead scope="col" className="hidden h-9 w-[136px] text-xs font-medium text-muted-foreground md:table-cell">
              Role
            </TableHead>
            <TableHead scope="col" className="hidden h-9 w-[216px] text-xs font-medium text-muted-foreground md:table-cell">
              Today
            </TableHead>
            <TableHead scope="col" className="hidden h-9 w-[120px] pr-5 text-xs font-medium text-muted-foreground md:table-cell">
              This week
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.userId} className="hover:bg-transparent">
              <TableCell className="h-[60px] px-4 py-2.5 md:px-5">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                  >
                    {initials(m.name)}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{m.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.email}</span>
                    <span className="text-xs text-muted-foreground md:hidden">
                      {ROLE_LABELS[m.role]} · Today: {todayText(m.today)} · This week: {m.week}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <RolePill role={m.role} />
              </TableCell>
              <TableCell className="hidden text-[13px] text-muted-foreground md:table-cell">{todayText(m.today)}</TableCell>
              <TableCell className="hidden pr-5 text-sm font-semibold tabular-nums md:table-cell">{m.week}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
