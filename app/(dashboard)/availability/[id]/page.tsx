import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { ScheduleEditor } from "@/features/schedules/components/schedule-editor";
import { deleteScheduleAction, saveScheduleAction, setDefaultScheduleAction } from "@/features/schedules/server/actions";
import { getSchedule } from "@/features/schedules/server/service";
import { listTimeZones } from "@/features/settings/schemas";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Edit schedule" };

export default async function ScheduleEditPage({ params }: PageProps<"/availability/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const schedule = await getSchedule(getDb(), user.id, id);
  if (!schedule) notFound();
  const { id: _id, isDefault, ...form } = schedule;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/availability" className="text-sm text-muted underline-offset-4 hover:underline">
            ← Availability
          </Link>
          <h1 className="text-2xl font-semibold">{schedule.name}</h1>
        </div>
        <div className="flex gap-2">
          {!isDefault && (
            <>
              <form action={setDefaultScheduleAction.bind(null, id)}>
                <Button type="submit" variant="secondary">
                  Make default
                </Button>
              </form>
              <form action={deleteScheduleAction.bind(null, id)}>
                <Button type="submit" variant="ghost">
                  Delete
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
      <Card>
        <ScheduleEditor
          initial={form}
          timeZones={listTimeZones()}
          weekStart={user.weekStart ?? 1}
          action={saveScheduleAction.bind(null, id)}
        />
      </Card>
    </div>
  );
}
