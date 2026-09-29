import { Card } from "@/components/ui/card";
import { hoursPerWeek, type Rule, weekGlance, weeklyMinutes } from "../week";

const TICKS = ["00", "06", "12", "18", "24"];

/** Seven 24-hour bars with the weekly hours drawn in; `footer` follows the hour total. */
export function WeekGlance({
  rules,
  weekStart,
  footer,
}: {
  rules: readonly Rule[];
  weekStart: number;
  footer?: string;
}) {
  return (
    <Card role="region" aria-labelledby="week-glance" className="gap-3 px-5 py-[18px]">
      <h2 id="week-glance" className="text-base font-semibold">
        Week at a glance
      </h2>
      <WeekBars rules={rules} weekStart={weekStart} />
      <p className="text-xs text-muted-foreground">
        {[hoursPerWeek(weeklyMinutes(rules)), footer].filter(Boolean).join(" · ")}
      </p>
    </Card>
  );
}

/** The bars alone (also used on the schedule list). */
export function WeekBars({ rules, weekStart }: { rules: readonly Rule[]; weekStart: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden className="ml-9 flex justify-between text-[11px] text-muted-foreground tabular-nums">
        {TICKS.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <ul className="flex flex-col gap-3">
        {weekGlance(rules, weekStart).map((day) => (
          <li key={day.weekday} className="flex items-center gap-2">
            <span aria-hidden className="w-7 text-xs text-muted-foreground">
              {day.short}
            </span>
            <div
              role="img"
              aria-label={day.summary}
              className="relative h-3 flex-1 overflow-hidden rounded-[4px] bg-muted"
            >
              {day.bars.map((bar, i) => (
                <span
                  key={i}
                  className="absolute inset-y-0 rounded-[4px] bg-highlight"
                  style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
