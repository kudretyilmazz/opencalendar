"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import { type ActionState, idle } from "@/lib/actions";
import type { ScheduleForm } from "../schemas";

type Range = { start: string; end: string };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function RangeRow(props: { range: Range; label: string; onChange: (r: Range) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="time"
        step={900}
        aria-label={`${props.label} start`}
        value={props.range.start}
        onChange={(e) => props.onChange({ ...props.range, start: e.target.value })}
        className="w-32"
      />
      <span aria-hidden>–</span>
      <Input
        type="time"
        step={900}
        aria-label={`${props.label} end`}
        value={props.range.end}
        onChange={(e) => props.onChange({ ...props.range, end: e.target.value })}
        className="w-32"
      />
      <Button type="button" variant="ghost" className="h-9 w-9 px-0" aria-label={`Remove ${props.label}`} onClick={props.onRemove}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

export function ScheduleEditor(props: {
  initial: ScheduleForm;
  timeZones: string[];
  weekStart: number;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [form, setForm] = useState<ScheduleForm>(props.initial);
  const [state, action, pending] = useActionState(props.action, idle);
  const [newDate, setNewDate] = useState("");
  const errors = state.fieldErrors ?? {};

  const order = Array.from({ length: 7 }, (_, i) => (props.weekStart + i) % 7);
  const rulesFor = (weekday: number) => form.rules.filter((r) => r.weekday === weekday);
  const setRulesFor = (weekday: number, ranges: Range[]) =>
    setForm((f) => ({
      ...f,
      rules: [...f.rules.filter((r) => r.weekday !== weekday), ...ranges.map((r) => ({ ...r, weekday }))].toSorted(
        (a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start),
      ),
    }));
  const setOverride = (date: string, ranges: Range[] | null) =>
    setForm((f) => ({
      ...f,
      overrides:
        ranges === null
          ? f.overrides.filter((o) => o.date !== date)
          : [...f.overrides.filter((o) => o.date !== date), { date, ranges }].toSorted((a, b) => a.date.localeCompare(b.date)),
    }));

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="payload" value={JSON.stringify(form)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={errors.name}>
          <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} />
        </Field>
        <Field label="Time zone" htmlFor="timeZone" error={errors.timeZone}>
          <Select id="timeZone" value={form.timeZone} onChange={(e) => setForm({ ...form, timeZone: e.target.value })}>
            {props.timeZones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">Weekly hours</legend>
        {order.map((weekday) => {
          const ranges = rulesFor(weekday);
          const on = ranges.length > 0;
          return (
            <div key={weekday} className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-start">
              <label className="flex w-40 items-center gap-2 pt-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setRulesFor(weekday, e.target.checked ? [{ start: "09:00", end: "17:00" }] : [])}
                />
                {WEEKDAYS[weekday]}
              </label>
              <div className="flex flex-1 flex-col gap-2">
                {on ? (
                  ranges.map((range, i) => (
                    <RangeRow
                      key={i}
                      range={range}
                      label={`${WEEKDAYS[weekday]} range ${i + 1}`}
                      onChange={(r) => setRulesFor(weekday, ranges.map((x, j) => (j === i ? r : x)))}
                      onRemove={() => setRulesFor(weekday, ranges.filter((_, j) => j !== i))}
                    />
                  ))
                ) : (
                  <p className="pt-2 text-sm text-muted">Unavailable</p>
                )}
              </div>
              {on && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 self-start"
                  onClick={() => setRulesFor(weekday, [...ranges, { start: "13:00", end: "17:00" }])}
                >
                  <Plus className="size-4" aria-hidden /> Add hours
                </Button>
              )}
            </div>
          );
        })}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">Date overrides</legend>
        <p className="text-sm text-muted">Change your hours for specific dates, or mark a date as unavailable.</p>
        {form.overrides.map((o) => (
          <div key={o.date} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{o.date}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={o.ranges.length === 0}
                    onChange={(e) => setOverride(o.date, e.target.checked ? [] : [{ start: "09:00", end: "17:00" }])}
                  />
                  Unavailable all day
                </label>
                <Button type="button" variant="ghost" className="h-9" onClick={() => setOverride(o.date, null)}>
                  Remove
                </Button>
              </div>
            </div>
            {o.ranges.map((range, i) => (
              <RangeRow
                key={i}
                range={range}
                label={`${o.date} range ${i + 1}`}
                onChange={(r) => setOverride(o.date, o.ranges.map((x, j) => (j === i ? r : x)))}
                onRemove={() => setOverride(o.date, o.ranges.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        ))}
        <div className="flex items-end gap-2">
          <Field label="Add an override for" htmlFor="newOverride">
            <Input id="newOverride" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-48" />
          </Field>
          <Button
            type="button"
            variant="secondary"
            disabled={!newDate || form.overrides.some((o) => o.date === newDate)}
            onClick={() => {
              setOverride(newDate, [{ start: "09:00", end: "17:00" }]);
              setNewDate("");
            }}
          >
            Add override
          </Button>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        {state.message && (
          <Alert tone={state.status === "success" ? "success" : "error"}>
            {state.message}
            {state.status === "error" && Object.keys(errors).length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(errors).map(([key, message]) => (
                  <li key={key}>{message}</li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Saving…" : "Save schedule"}
        </Button>
      </div>
    </form>
  );
}
