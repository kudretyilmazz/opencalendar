import { z } from "zod";
import { isValidTimeZone, parseDate } from "@/lib/availability/tz";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

export const timeRangeSchema = z
  .object({ start: hhmm, end: hhmm })
  .refine((r) => r.end === "00:00" || r.end > r.start, { message: "End must be after start", path: ["end"] });

export const weeklyRuleSchema = z.intersection(z.object({ weekday: z.number().int().min(0).max(6) }), timeRangeSchema);

export const dateOverrideSchema = z.object({
  date: z.string().refine((d) => {
    try {
      parseDate(d);
      return true;
    } catch {
      return false;
    }
  }, "Invalid date"),
  ranges: z.array(timeRangeSchema).max(10),
});

export const scheduleFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    timeZone: z.string().refine(isValidTimeZone, "Unknown time zone"),
    rules: z.array(weeklyRuleSchema).max(70),
    overrides: z.array(dateOverrideSchema).max(400),
  })
  .refine((s) => new Set(s.overrides.map((o) => o.date)).size === s.overrides.length, {
    message: "Each date can only have one override",
    path: ["overrides"],
  });

export type ScheduleForm = z.infer<typeof scheduleFormSchema>;

export const DEFAULT_RULES: ScheduleForm["rules"] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  start: "09:00",
  end: "17:00",
}));
