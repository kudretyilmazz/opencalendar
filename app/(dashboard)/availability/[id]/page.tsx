import { Plus, Star } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HEADER_BUTTON_CLASS, PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { DeleteScheduleButton } from "@/features/schedules/components/schedule-actions";
import { ScheduleEditor } from "@/features/schedules/components/schedule-editor";
import { ScheduleSwitcher, TroubleshooterCard } from "@/features/schedules/components/schedule-switcher";
import {
  createScheduleAction,
  deleteScheduleAction,
  saveScheduleAction,
  setDefaultScheduleAction,
} from "@/features/schedules/server/actions";
import { loadScheduleCards } from "@/features/schedules/server/usage";
import { listTimeZones } from "@/features/settings/schemas";
import { formatDate, localDateOf } from "@/lib/availability/tz";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { requestTime } from "@/lib/clock";

export const metadata: Metadata = { title: "Edit schedule" };

const headerButton = cn(HEADER_BUTTON_CLASS, "h-11 bg-card md:h-10");

export default async function ScheduleEditPage({ params }: PageProps<"/availability/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const weekStart = user.weekStart ?? 1;
  const cards = await loadScheduleCards(getDb(), user.id, weekStart);
  const schedule = cards.find((s) => s.id === id);
  if (!schedule) notFound();
  const { name, timeZone, rules, overrides } = schedule;

  return (
    <div className={PAGE_CLASS}>
      <PageHeader
        title="Availability"
        description="When people can book you. Event types use your default schedule unless you pick another."
        actions={
          <>
            {!schedule.isDefault && (
              <>
                <DeleteScheduleButton name={name} action={deleteScheduleAction.bind(null, id)} />
                <form action={setDefaultScheduleAction.bind(null, id)}>
                  <Button type="submit" variant="outline" className={headerButton}>
                    <Star aria-hidden />
                    Set as default
                  </Button>
                </form>
              </>
            )}
            <form action={createScheduleAction}>
              <Button type="submit" variant="outline" className={headerButton}>
                <Plus aria-hidden />
                New schedule
              </Button>
            </form>
          </>
        }
      />
      <ScheduleSwitcher schedules={cards} activeId={id} />
      <ScheduleEditor
        // Remount on a different schedule so the editor starts from its saved state.
        key={id}
        initial={{ name, timeZone, rules, overrides }}
        timeZones={listTimeZones()}
        weekStart={weekStart}
        today={formatDate(localDateOf(requestTime(), timeZone))}
        eventTypeCount={schedule.eventTypeCount}
        action={saveScheduleAction.bind(null, id)}
      >
        <TroubleshooterCard />
      </ScheduleEditor>
    </div>
  );
}
