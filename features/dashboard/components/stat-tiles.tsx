import { Clock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { DashboardData } from "../server/overview";
import { bookedMinutes, type OverviewBooking, weekDelta } from "../overview";

function Tile({ label, value, children, desktopOnly }: { label: string; value: number; children: ReactNode; desktopOnly?: boolean }) {
  return (
    <Card
      className={cn(
        "gap-1 rounded-[12px] border border-border px-4 py-3.5 ring-0 md:gap-1.5 md:px-5 md:py-[18px]",
        desktopOnly && "hidden md:flex",
      )}
    >
      <span className="text-xs text-muted-foreground md:text-[13px]">{label}</span>
      <span className="text-2xl font-semibold tracking-[-0.02em] tabular-nums md:text-[28px] md:leading-9">{value}</span>
      <span className="hidden text-xs md:block">{children}</span>
    </Card>
  );
}

const meetings = (n: number) => `${n} meeting${n === 1 ? "" : "s"}`;

/** The four numbers across the top (two on phones, plus a pending banner). */
export function StatTiles({ today, data }: { today: OverviewBooking[]; data: DashboardData }) {
  const minutes = today.reduce((sum, b) => sum + Math.round((b.endAt - b.startAt) / 60_000), 0);
  const delta = weekDelta(data.week.count, data.week.previous);
  return (
    <>
      <section aria-label="At a glance" className="grid grid-cols-2 gap-2.5 md:gap-4 xl:grid-cols-4">
        <Tile label="Today" value={today.length}>
          <span className="text-muted-foreground">
            {meetings(today.length)} · {bookedMinutes(minutes)} booked
          </span>
        </Tile>
        <Tile label="This week" value={data.week.count}>
          <span className={delta.tone === "up" ? "text-success" : "text-muted-foreground"}>{delta.text}</span>
        </Tile>
        <Tile label="Needs confirmation" value={data.pendingCount} desktopOnly>
          {data.pendingCount > 0 ? (
            <Link href="/bookings?tab=unconfirmed" className="font-medium text-highlight-text hover:underline">
              Review requests →
            </Link>
          ) : (
            <span className="text-muted-foreground">All caught up</span>
          )}
        </Tile>
        <Tile label="No-shows · 30 days" value={data.noShows.count} desktopOnly>
          <span className="text-muted-foreground">{data.noShows.of > 0 ? `of ${meetings(data.noShows.of)}` : "No past meetings yet"}</span>
        </Tile>
      </section>
      {data.pendingCount > 0 && (
        <Link
          href="/bookings?tab=unconfirmed"
          className="flex min-h-14 items-center gap-3 rounded-[12px] bg-warning px-4 py-3 text-warning-foreground md:hidden"
        >
          <Clock className="size-[18px] shrink-0" aria-hidden />
          <span className="flex-1 text-sm font-medium">
            {data.pendingCount} booking{data.pendingCount === 1 ? "" : "s"} need{data.pendingCount === 1 ? "s" : ""} confirmation
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}
    </>
  );
}
