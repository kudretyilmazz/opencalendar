import type { Metadata } from "next";
import Link from "next/link";
import { PAGE_CLASS, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <div className={PAGE_CLASS}>
      <div className="flex flex-col gap-3">
        <Link href="/availability" className="flex min-h-11 items-center self-start text-[13px] font-medium text-muted-foreground hover:text-foreground md:min-h-0">
          ← Availability
        </Link>
        <PageHeader title="Troubleshooter" description="See every possible start time of a day and why it can or can’t be booked." />
      </div>
      {!eventType ? (
        <Card className="gap-0 px-5 py-[18px] text-muted-foreground">Create an event type first.</Card>
      ) : (
        <>
          <Card className="gap-0 px-5 py-4">
            <form className="flex flex-wrap items-end gap-3" action="/availability/troubleshoot">
              <div className="flex w-full flex-col gap-1.5 sm:w-auto">
                <Label htmlFor="troubleshoot-event-type">Event type</Label>
                <Select name="eventType" defaultValue={eventType.id}>
                  <SelectTrigger id="troubleshoot-event-type" className="w-full data-[size=default]:h-11 sm:w-56 md:data-[size=default]:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes.map((et) => (
                      <SelectItem key={et.id} value={et.id}>
                        {et.title}
                      </SelectItem>
                    ))}
                    {teamTypes.map((et) => (
                      <SelectItem key={et.id} value={et.id}>
                        {et.teamName}: {et.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isTeam && (
                <div className="flex w-full flex-col gap-1.5 sm:w-auto">
                  <Label htmlFor="troubleshoot-host">Host</Label>
                  {/* Keyed on the event type so its hosts' default is picked up after "Show". */}
                  <Select key={eventType.id} name="host" defaultValue={host.id}>
                    <SelectTrigger id="troubleshoot-host" className="w-full data-[size=default]:h-11 sm:w-44 md:data-[size=default]:h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {hosts.map((h) => (
                        <SelectItem key={h.userId} value={h.userId}>
                          {h.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex w-full flex-col gap-1.5 sm:w-auto">
                <Label htmlFor="troubleshoot-date">Date</Label>
                <DatePicker id="troubleshoot-date" name="date" defaultValue={date} weekStartsOn={user.weekStart ?? 1} className="w-full sm:w-48 [&>button]:h-11 md:[&>button]:h-10" />
              </div>
              <Button type="submit" variant="outline" className="h-11 w-full rounded-md bg-card px-3.5 sm:w-auto md:h-10">
                Show
              </Button>
            </form>
          </Card>
          <Card className="gap-0 py-0">
            <Table>
              <TableCaption className="mt-0 caption-top p-4 text-left">
                {date} · {prefs.timeZone.replaceAll("_", " ")} · {eventType.durationMinutes} min{isTeam ? ` · ${host.name}` : ""}
              </TableCaption>
              <TableHeader>
                <TableRow className="border-t">
                  <TableHead scope="col" className="px-4">Time</TableHead>
                  <TableHead scope="col" className="px-4">Status</TableHead>
                  <TableHead scope="col" className="px-4">Because of</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result?.slots.map((s) => (
                  <TableRow key={s.start}>
                    <TableCell className="px-4 tabular-nums">
                      {formatTime(s.start, prefs)} – {formatTime(s.end, prefs)}
                    </TableCell>
                    <TableCell className={cn("px-4", s.status === "available" ? "text-success" : "text-muted-foreground")}>
                      {s.status === "available" ? `Available${s.seatsRemaining !== undefined ? ` (${s.seatsRemaining} seats left)` : ""}` : REASON_LABELS[s.status]}
                    </TableCell>
                    <TableCell className="px-4 text-muted-foreground">{s.source ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
