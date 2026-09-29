"use client";

import { type ReactNode, useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox, timeZoneOptions } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { type ActionState, idle } from "@/lib/actions";
import type { ScheduleForm } from "../schemas";
import { eventTypeCountLabel, type Range } from "../week";
import { DateOverrides } from "./date-overrides";
import { WeekGlance } from "./week-glance";
import { WeeklyHours } from "./weekly-hours";
import { submitWithoutReset } from "@/lib/submit-without-reset";

/**
 * The schedule editor: name, time zone and weekly hours on the left; the week at a glance, date
 * overrides and `children` (the troubleshooter link) on the right. Everything is saved at once.
 */
export function ScheduleEditor(props: {
  initial: ScheduleForm;
  timeZones: string[];
  weekStart: number;
  /** "yyyy-MM-dd" in the host's time zone. */
  today: string;
  /** Event types booking against this schedule. */
  eventTypeCount: number;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
}) {
  const [form, setForm] = useState<ScheduleForm>(props.initial);
  const [saved, setSaved] = useState<ScheduleForm>(props.initial);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await props.action(prev, formData);
    if (result.status === "success") setSaved(JSON.parse(String(formData.get("payload"))) as ScheduleForm);
    return result;
  }, idle);
  const errors = state.fieldErrors ?? {};
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const setOverride = (date: string, ranges: Range[] | null) =>
    setForm((f) => ({
      ...f,
      overrides:
        ranges === null
          ? f.overrides.filter((o) => o.date !== date)
          : [...f.overrides.filter((o) => o.date !== date), { date, ranges }].toSorted((a, b) =>
              a.date.localeCompare(b.date),
            ),
    }));
  const usage = `${eventTypeCountLabel(props.eventTypeCount)} use${props.eventTypeCount === 1 ? "s" : ""} this schedule`;

  return (
    <form
      action={action}
      onSubmit={submitWithoutReset(action)}
      className="grid items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
    >
      <input type="hidden" name="payload" value={JSON.stringify(form)} />
      <Card role="region" aria-labelledby="weekly-hours" className="gap-0 py-0">
        <div className="flex flex-col gap-4 border-b border-border px-4 py-5 md:flex-row md:items-start md:px-6">
          <FormField label="Name" htmlFor="name" error={errors.name} className="flex-1 gap-1.5">
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={100}
              className="h-11 rounded-md bg-card md:h-10"
            />
          </FormField>
          <FormField label="Time zone" htmlFor="timeZone" error={errors.timeZone} className="gap-1.5 md:w-[280px]">
            <Combobox
              id="timeZone"
              options={timeZoneOptions(props.timeZones)}
              value={form.timeZone}
              onValueChange={(timeZone) => setForm({ ...form, timeZone })}
              searchPlaceholder="Search time zones…"
              aria-invalid={errors.timeZone ? true : undefined}
              className="h-11 rounded-md bg-card md:h-10"
            />
          </FormField>
        </div>
        <h2 id="weekly-hours" className="px-4 pt-[18px] pb-1.5 text-base font-semibold md:px-6">
          Weekly hours
        </h2>
        <WeeklyHours
          rules={form.rules}
          weekStart={props.weekStart}
          onRulesChange={(update) => setForm((f) => ({ ...f, rules: update(f.rules) }))}
        />
        {state.status === "error" && state.message && (
          <div className="px-4 pb-4 md:px-6">
            <Alert variant="destructive">
              <AlertDescription>
                {state.message}
                {Object.keys(errors).length > 0 && (
                  <ul className="mt-1 list-disc pl-5">
                    {Object.entries(errors).map(([key, message]) => (
                      <li key={key}>{message}</li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-background px-4 py-4 md:px-6">
          {state.status === "success" && !dirty ? (
            <p role="status" className="flex-1 basis-full text-[13px] font-medium text-success md:basis-0">
              {state.message}
            </p>
          ) : (
            <p className="flex-1 basis-full text-[13px] text-muted-foreground md:basis-0">
              Changes apply to times offered from now on; existing bookings stay as they are.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-11 rounded-md px-3 text-muted-foreground md:h-10"
            disabled={!dirty || pending}
            onClick={() => setForm(saved)}
          >
            Discard
          </Button>
          <Button type="submit" disabled={pending} className="h-11 flex-1 rounded-md px-4 md:h-10 md:flex-none">
            {pending && <Spinner />}
            {pending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <WeekGlance rules={form.rules} weekStart={props.weekStart} footer={usage} />
        <DateOverrides
          overrides={form.overrides}
          today={props.today}
          weekStart={props.weekStart}
          onOverrideChange={setOverride}
        />
        {props.children}
      </div>
    </form>
  );
}
