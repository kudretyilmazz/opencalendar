import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HEADER_BUTTON_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { DefaultPill, TroubleshooterCard } from "@/features/schedules/components/schedule-switcher";
import { WeekBars } from "@/features/schedules/components/week-glance";
import { createScheduleAction, setDefaultScheduleAction } from "@/features/schedules/server/actions";
import { ensureDefaultSchedule } from "@/features/schedules/server/service";
import { type ScheduleCard, loadScheduleCards } from "@/features/schedules/server/usage";
import { hoursPerWeek, weeklyMinutes } from "@/features/schedules/week";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Availability" };

const cardButton = "h-11 rounded-md px-3.5 text-sm md:h-9";

function ScheduleSummaryCard({ schedule, weekStart }: { schedule: ScheduleCard; weekStart: number }) {
  const headingId = `schedule-${schedule.id}`;
  return (
    <Card role="region" aria-labelledby={headingId} className="gap-4 px-5 py-[18px]">
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="flex items-center gap-2 text-base font-semibold">
          {schedule.name}
          {schedule.isDefault && <DefaultPill />}
        </h2>
        <p className="text-xs text-muted-foreground">
          {schedule.line} · {schedule.timeZone.replaceAll("_", " ")}
        </p>
      </div>
      <WeekBars rules={schedule.rules} weekStart={weekStart} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-xs text-muted-foreground">{hoursPerWeek(weeklyMinutes(schedule.rules))}</span>
        {!schedule.isDefault && (
          <form action={setDefaultScheduleAction.bind(null, schedule.id)}>
            <Button type="submit" variant="ghost" className={cardButton}>
              Set as default
            </Button>
          </form>
        )}
        <Button asChild variant="outline" className={cn(cardButton, "bg-card")}>
          <Link href={`/availability/${schedule.id}`}>
            Edit<span className="sr-only"> {schedule.name}</span>
          </Link>
        </Button>
      </div>
    </Card>
  );
}

export default async function AvailabilityPage() {
  const user = await requireUser();
  const db = getDb();
  const weekStart = user.weekStart ?? 1;
  await ensureDefaultSchedule(db, user.id, user.timeZone ?? "UTC");
  const schedules = await loadScheduleCards(db, user.id, weekStart);

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Availability"
        description="When people can book you. Event types use your default schedule unless you pick another."
        actions={
          <form action={createScheduleAction}>
            <Button type="submit" variant="outline" className={cn(HEADER_BUTTON_CLASS, "h-11 bg-card md:h-10")}>
              <Plus aria-hidden />
              New schedule
            </Button>
          </form>
        }
      />
      <div className="grid items-start gap-4 md:grid-cols-2 md:gap-6">
        {schedules.map((s) => (
          <ScheduleSummaryCard key={s.id} schedule={s} weekStart={weekStart} />
        ))}
      </div>
      <div className="md:max-w-[340px]">
        <TroubleshooterCard />
      </div>
    </div>
  );
}
