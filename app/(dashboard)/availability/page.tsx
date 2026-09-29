import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { createScheduleAction } from "@/features/schedules/server/actions";
import { ensureDefaultSchedule, getSchedule, listSchedules } from "@/features/schedules/server/service";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Availability" };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function AvailabilityPage() {
  const user = await requireUser();
  const db = getDb();
  await ensureDefaultSchedule(db, user.id, user.timeZone ?? "UTC");
  const schedules = await Promise.all((await listSchedules(db, user.id)).map((s) => getSchedule(db, user.id, s.id)));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Availability</h1>
          <p className="text-sm text-muted">When people can book you. Event types use your default schedule unless you pick another.</p>
        </div>
        <form action={createScheduleAction}>
          <Button type="submit">New schedule</Button>
        </form>
      </div>
      <ul className="flex flex-col gap-3">
        {schedules.map(
          (s) =>
            s && (
              <li key={s.id}>
                <Card className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <Link href={`/availability/${s.id}`} className="font-medium underline-offset-4 hover:underline">
                      {s.name}
                    </Link>
                    {s.isDefault && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs">Default</span>}
                    <p className="text-sm text-muted">
                      {[...new Set(s.rules.map((r) => r.weekday))].map((d) => DAYS[d]).join(", ") || "No weekly hours"} ·{" "}
                      {s.timeZone.replaceAll("_", " ")}
                    </p>
                  </div>
                  <Link href={`/availability/${s.id}`} className="text-sm font-medium underline-offset-4 hover:underline">
                    Edit
                  </Link>
                </Card>
              </li>
            ),
        )}
      </ul>
    </div>
  );
}
