import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays, formatDate, type LocalDate, wallToUtc } from "@/lib/availability/tz";
import type { Interval } from "@/lib/availability/types";
import type { MemberAvailability } from "../server/availability";

/**
 * Team availability view (TEAM-010): one row per member, one bar per day, in the viewer's time
 * zone. Light = working hours, dark = busy. Server-rendered; the table parts are plain markup.
 */

const HOURS = [0, 6, 12, 18];

function segments(intervals: Interval[], dayStart: number, dayEnd: number) {
  const length = dayEnd - dayStart;
  return intervals
    .map((i) => ({ start: Math.max(i.start, dayStart), end: Math.min(i.end, dayEnd) }))
    .filter((i) => i.end > i.start)
    .map((i) => ({ left: ((i.start - dayStart) / length) * 100, width: ((i.end - i.start) / length) * 100 }));
}

function timeLabel(ms: number, timeZone: string) {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(ms);
}

export function AvailabilityGrid({
  members,
  firstDay,
  days,
  timeZone,
}: {
  members: MemberAvailability[];
  firstDay: LocalDate;
  days: number;
  timeZone: string;
}) {
  const dayList = Array.from({ length: days }, (_, i) => addDays(firstDay, i));
  return (
    <div className="flex flex-col gap-4 overflow-x-auto">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-success/30" aria-hidden /> Working hours
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-foreground/70" aria-hidden /> Busy
        </span>
        <span>Times in {timeZone.replaceAll("_", " ")}</span>
      </div>
      <Table className="min-w-[40rem] border-separate border-spacing-y-2">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead scope="col" className="h-auto w-32 px-0">
              Member
            </TableHead>
            {dayList.map((d) => (
              <TableHead key={formatDate(d)} scope="col" className="h-auto px-0 pr-2">
                {new Intl.DateTimeFormat("en", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(Date.UTC(d.year, d.month - 1, d.day))}
                <span className="mt-0.5 flex justify-between text-[10px] font-normal text-muted-foreground" aria-hidden>
                  {HOURS.map((h) => (
                    <span key={h}>{String(h).padStart(2, "0")}</span>
                  ))}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.userId} className="border-0 hover:bg-transparent">
              <TableHead scope="row" className="h-auto px-0 pr-2 font-normal whitespace-normal">
                {m.name}
                {!m.timeZone && <span className="block text-xs text-muted-foreground">No schedule</span>}
              </TableHead>
              {dayList.map((d) => {
                const dayStart = wallToUtc(d, 0, timeZone);
                const dayEnd = wallToUtc(addDays(d, 1), 0, timeZone);
                const busy = m.busy.filter((b) => b.end > dayStart && b.start < dayEnd);
                const label = busy.length
                  ? `Busy ${busy.map((b) => `${timeLabel(Math.max(b.start, dayStart), timeZone)}–${timeLabel(Math.min(b.end, dayEnd), timeZone)}`).join(", ")}`
                  : "No busy time";
                return (
                  <TableCell key={formatDate(d)} className="p-0 pr-2">
                    <div
                      className="relative h-6 rounded-sm bg-muted"
                      role="img"
                      aria-label={`${m.name}, ${formatDate(d)}: ${label}`}
                    >
                      {segments(m.working, dayStart, dayEnd).map((s, i) => (
                        <span
                          key={`w${i}`}
                          className="absolute inset-y-0 bg-success/30"
                          style={{ left: `${s.left}%`, width: `${s.width}%` }}
                        />
                      ))}
                      {segments(m.busy, dayStart, dayEnd).map((s, i) => (
                        <span
                          key={`b${i}`}
                          className="absolute inset-y-1 rounded-sm bg-foreground/70"
                          style={{ left: `${s.left}%`, width: `${s.width}%` }}
                        />
                      ))}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
