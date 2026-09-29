import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, Input, Select } from "@/components/ui/primitives";
import { getDb } from "@/db/client";
import { explainDay, REASON_LABELS } from "@/features/bookings/server/explain";
import { externalBusyFor } from "@/features/calendars/server/runtime";
import { listEventTypes } from "@/features/event-types/server/service";
import { troubleshootableTeamEventTypes } from "@/features/teams/server/troubleshoot";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatDate, localDateOf, parseDate } from "@/lib/availability/tz";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { requestTime } from "@/lib/clock";
import { formatTime } from "@/lib/format";

export const metadata: Metadata = { title: "Availability troubleshooter" };

function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    parseDate(value);
    return value;
  } catch {
    return null;
  }
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * AVL-008: why is (or isn't) each time bookable on a given day? For your own event types, and —
 * for team admins — for any host of their teams' event types (without the host's meeting titles).
 */
export default async function TroubleshootPage({ searchParams }: PageProps<"/availability/troubleshoot">) {
  const user = await requireUser();
  const params = await searchParams;
  const db = getDb();
  const [eventTypes, teamTypes] = await Promise.all([listEventTypes(db, user.id), troubleshootableTeamEventTypes(db, user.id)]);
  const now = requestTime();
  const tz = user.timeZone ?? "UTC";
  const date = validDate(params.date) ?? formatDate(localDateOf(now, tz));
  const selected = one(params.eventType);
  const personal = eventTypes.find((e) => e.id === selected);
  const teamType = personal ? undefined : (teamTypes.find((e) => e.id === selected) ?? (eventTypes.length ? undefined : teamTypes[0]));
  const eventType = personal ?? teamType ?? eventTypes[0];
  const me = { id: user.id, name: user.name, email: user.email, username: user.username ?? "", timeZone: tz, locale: user.locale ?? "en", timeFormat: user.timeFormat ?? 24, image: null };
  // Team event types: the chosen host (default: the first), checked against the type's hosts.
  const hosts = teamType?.hosts ?? [];
  const hostRow = hosts.find((h) => h.userId === one(params.host)) ?? hosts[0];
  const [hostUser] = hostRow ? await db.select().from(userTable).where(eq(userTable.id, hostRow.userId)) : [];
  const host = hostUser
    ? { id: hostUser.id, name: hostUser.name, email: hostUser.email, username: hostUser.username ?? "", timeZone: hostUser.timeZone, locale: hostUser.locale, timeFormat: hostUser.timeFormat, image: null }
    : me;
  const isTeam = Boolean(hostRow);
  const result = eventType
    ? await explainDay(db, {
        host,
        eventType,
        date,
        now,
        externalBusy: externalBusyFor(host, eventType.id, Number.POSITIVE_INFINITY),
        ...(isTeam && { scheduleId: hostRow!.scheduleId, revealSources: host.id === user.id }),
      })
    : null;
  const prefs = { locale: user.locale ?? "en", timeZone: result?.timeZone ?? tz, hour12: user.timeFormat === 12 };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/availability" className="text-sm text-muted underline-offset-4 hover:underline">
          ← Availability
        </Link>
        <h1 className="text-2xl font-semibold">Troubleshooter</h1>
        <p className="text-sm text-muted">See every possible start time of a day and why it can or can’t be booked.</p>
      </div>
      {!eventType ? (
        <Card className="text-sm text-muted">Create an event type first.</Card>
      ) : (
        <>
          <form className="flex flex-wrap items-end gap-3" action="/availability/troubleshoot">
            <label className="flex flex-col gap-1 text-sm">
              Event type
              <Select name="eventType" defaultValue={eventType.id} className="w-56">
                {eventTypes.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.title}
                  </option>
                ))}
                {teamTypes.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.teamName}: {et.title}
                  </option>
                ))}
              </Select>
            </label>
            {isTeam && (
              <label className="flex flex-col gap-1 text-sm">
                Host
                <Select name="host" defaultValue={host.id} className="w-44">
                  {hosts.map((h) => (
                    <option key={h.userId} value={h.userId}>
                      {h.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm">
              Date
              <Input type="date" name="date" defaultValue={date} className="w-44" />
            </label>
            <Button type="submit" variant="secondary">
              Show
            </Button>
          </form>
          <Card className="p-0">
            <table className="w-full text-sm">
              <caption className="p-4 text-left text-muted">
                {date} · {prefs.timeZone.replaceAll("_", " ")} · {eventType.durationMinutes} min{isTeam ? ` · ${host.name}` : ""}
              </caption>
              <thead>
                <tr className="border-y border-border text-left">
                  <th scope="col" className="px-4 py-2 font-medium">Time</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 font-medium">Because of</th>
                </tr>
              </thead>
              <tbody>
                {result?.slots.map((s) => (
                  <tr key={s.start} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 tabular-nums">
                      {formatTime(s.start, prefs)} – {formatTime(s.end, prefs)}
                    </td>
                    <td className={cn("px-4 py-2", s.status === "available" ? "text-success" : "text-muted")}>
                      {s.status === "available" ? `Available${s.seatsRemaining !== undefined ? ` (${s.seatsRemaining} seats left)` : ""}` : REASON_LABELS[s.status]}
                    </td>
                    <td className="px-4 py-2 text-muted">{s.source ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
