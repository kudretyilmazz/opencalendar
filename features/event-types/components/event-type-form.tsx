"use client";

import { useActionState, useState } from "react";
import { useTimeZones } from "@/lib/use-time-zones";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import { type ActionState, idle } from "@/lib/actions";
import {
  type EventTypeFormInput,
  LOCATION_KINDS,
  LOCATION_LABELS,
  LOCATION_NEEDS_VALUE,
  type LocationKind,
  type Question,
  slugify,
} from "../schemas";
import { AdvancedSettings } from "./advanced-settings";
import { QuestionsEditor } from "./questions-editor";

export type CalendarOption = { id: string; name: string; account: string; readOnly: boolean };
export type CalendarSettings = { conflictCalendarIds: string[]; destinationCalendarId: string | null };

/** Which connected account a location kind needs, if any (INT-008/009). */
const LOCATION_REQUIRES: Partial<Record<LocationKind, { provider: string; label: string }>> = {
  google_meet: { provider: "google", label: "Connect Google Calendar and make it the destination calendar" },
  ms_teams: { provider: "microsoft", label: "Connect Microsoft 365 and make it the destination calendar" },
  zoom: { provider: "zoom", label: "Connect Zoom" },
};

const DURATION_CHOICES = [15, 20, 30, 45, 60, 90, 120];
const NOTICE_UNITS = { minutes: 1, hours: 60, days: 1440 } as const;

type NoticeUnit = keyof typeof NOTICE_UNITS;

function splitNotice(minutes: number): { value: number; unit: NoticeUnit } {
  if (minutes && minutes % 1440 === 0) return { value: minutes / 1440, unit: "days" };
  if (minutes && minutes % 60 === 0) return { value: minutes / 60, unit: "hours" };
  return { value: minutes, unit: "minutes" };
}

const num = (value: string) => (value === "" ? 0 : Number(value));

export function EventTypeFormView(props: {
  initial: EventTypeFormInput;
  schedules: { id: string; name: string; isDefault: boolean }[];
  profileUrl: string;
  isNew: boolean;
  calendars: CalendarOption[];
  calendarSettings: CalendarSettings;
  connectedProviders: string[];
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Team event types: hosts use their own schedules; seats, series and private links are personal-only. */
  team?: boolean;
}) {
  const [form, setForm] = useState<EventTypeFormInput>(props.initial);
  const [slugTouched, setSlugTouched] = useState(!props.isNew);
  const [notice, setNotice] = useState(splitNotice(props.initial.minNoticeMinutes));
  const [state, action, pending] = useActionState(props.action, idle);
  const errors = state.fieldErrors ?? {};
  const set = (patch: Partial<EventTypeFormInput>) => setForm((f) => ({ ...f, ...patch }));
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(props.calendarSettings);
  const [newLocation, setNewLocation] = useState<LocationKind | "">("");
  const payload = { ...form, minNoticeMinutes: notice.value * NOTICE_UNITS[notice.unit], calendarSettings };
  const setLocation = (index: number, value: string | null) =>
    set({ locations: form.locations.map((l, i) => (i === index ? { ...l, value } : l)) });
  const usedKinds = new Set(form.locations.map((l) => l.kind));
  const timeZones = useTimeZones();

  const toggleExtra = (d: number) =>
    set({
      extraDurations: form.extraDurations.includes(d)
        ? form.extraDurations.filter((x) => x !== d)
        : [...form.extraDurations, d],
    });

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="title" error={errors.title}>
          <Input
            id="title"
            value={form.title}
            required
            maxLength={100}
            onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
          />
        </Field>
        <Field label="URL" htmlFor="slug" error={errors.slug} hint={`${props.profileUrl}/${form.slug || "…"}`}>
          <Input
            id="slug"
            value={form.slug}
            required
            onChange={(e) => {
              setSlugTouched(true);
              set({ slug: e.target.value.toLowerCase() });
            }}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Description"
            htmlFor="description"
            error={errors.description}
            hint="Shown on your booking page. Supports Markdown: **bold**, *italic*, `code`, [links](https://…), lists (- or 1.) and # headings."
          >
            <textarea
              id="description"
              className="min-h-24 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
              value={form.description ?? ""}
              maxLength={5000}
              onChange={(e) => set({ description: e.target.value || null })}
            />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Duration</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default duration (minutes)" htmlFor="duration" error={errors.durationMinutes}>
            <Input
              id="duration"
              type="number"
              min={5}
              max={720}
              step={5}
              value={form.durationMinutes}
              onChange={(e) => set({ durationMinutes: num(e.target.value) })}
            />
          </Field>
          <Field
            label="Start times every (minutes)"
            htmlFor="interval"
            error={errors.slotIntervalMinutes}
            hint="Leave empty to use the meeting duration."
          >
            <Input
              id="interval"
              type="number"
              min={5}
              max={720}
              step={5}
              value={form.slotIntervalMinutes ?? ""}
              onChange={(e) => set({ slotIntervalMinutes: e.target.value === "" ? null : num(e.target.value) })}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Also let bookers choose</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {DURATION_CHOICES.filter((d) => d !== form.durationMinutes).map((d) => (
              <label key={d} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={form.extraDurations.includes(d)} onChange={() => toggleExtra(d)} />
                {d} min
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Limits</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Buffer before (minutes)" htmlFor="bufferBefore" error={errors.bufferBeforeMinutes}>
            <Input
              id="bufferBefore"
              type="number"
              min={0}
              max={240}
              step={5}
              value={form.bufferBeforeMinutes}
              onChange={(e) => set({ bufferBeforeMinutes: num(e.target.value) })}
            />
          </Field>
          <Field label="Buffer after (minutes)" htmlFor="bufferAfter" error={errors.bufferAfterMinutes}>
            <Input
              id="bufferAfter"
              type="number"
              min={0}
              max={240}
              step={5}
              value={form.bufferAfterMinutes}
              onChange={(e) => set({ bufferAfterMinutes: num(e.target.value) })}
            />
          </Field>
          <Field label="Minimum notice" htmlFor="notice" error={errors.minNoticeMinutes}>
            <div className="flex gap-2">
              <Input
                id="notice"
                type="number"
                min={0}
                value={notice.value}
                onChange={(e) => setNotice({ ...notice, value: num(e.target.value) })}
              />
              <Select
                aria-label="Minimum notice unit"
                value={notice.unit}
                onChange={(e) => setNotice({ ...notice, unit: e.target.value as NoticeUnit })}
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </Select>
            </div>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Bookable" htmlFor="horizonType" error={errors.horizonType}>
            <Select
              id="horizonType"
              value={form.horizonType}
              onChange={(e) =>
                set({
                  horizonType: e.target.value as EventTypeFormInput["horizonType"],
                  horizonDays: form.horizonDays ?? 60,
                })
              }
            >
              <option value="rolling_days">Up to N calendar days ahead</option>
              <option value="rolling_business_days">Up to N business days ahead</option>
              <option value="date_range">Within a date range</option>
              <option value="unlimited">Indefinitely</option>
            </Select>
          </Field>
          {(form.horizonType === "rolling_days" || form.horizonType === "rolling_business_days") && (
            <Field label="Days" htmlFor="horizonDays" error={errors.horizonDays}>
              <Input
                id="horizonDays"
                type="number"
                min={1}
                max={730}
                value={form.horizonDays ?? ""}
                onChange={(e) => set({ horizonDays: e.target.value === "" ? null : num(e.target.value) })}
              />
            </Field>
          )}
          {form.horizonType === "date_range" && (
            <>
              <Field label="From" htmlFor="rangeStart" error={errors.rangeStart}>
                <Input
                  id="rangeStart"
                  type="date"
                  value={form.rangeStart ?? ""}
                  onChange={(e) => set({ rangeStart: e.target.value || null })}
                />
              </Field>
              <Field label="To" htmlFor="rangeEnd" error={errors.rangeEnd}>
                <Input
                  id="rangeEnd"
                  type="date"
                  value={form.rangeEnd ?? ""}
                  onChange={(e) => set({ rangeEnd: e.target.value || null })}
                />
              </Field>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {!props.team && (
          <Field label="Availability schedule" htmlFor="scheduleId" error={errors.scheduleId}>
            <Select
              id="scheduleId"
              value={form.scheduleId ?? ""}
              onChange={(e) => set({ scheduleId: e.target.value || null })}
            >
              <option value="">Default schedule</option>
              {props.schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isDefault ? " (default)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Additional guests allowed" htmlFor="maxGuests" error={errors.maxGuests}>
          <Input
            id="maxGuests"
            type="number"
            min={0}
            max={10}
            value={form.maxGuests}
            onChange={(e) => set({ maxGuests: num(e.target.value) })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.hidden} onChange={(e) => set({ hidden: e.target.checked })} />
          Hide from my profile page (still bookable by direct link)
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Locations</h2>
        <p className="text-sm text-muted">Add one or more. With several, the invitee chooses when booking.</p>
        {errors.locations && <Alert tone="error">{errors.locations}</Alert>}
        <ul className="flex flex-col gap-2">
          {form.locations.map((loc, i) => {
            const needs = LOCATION_NEEDS_VALUE[loc.kind];
            const requirement = LOCATION_REQUIRES[loc.kind];
            return (
              <li key={loc.kind} className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{LOCATION_LABELS[loc.kind]}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8"
                    onClick={() => set({ locations: form.locations.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </Button>
                </div>
                {needs && (
                  <Field
                    label={needs === "address" ? "Address" : needs === "phone" ? "Your phone number" : "Meeting link"}
                    htmlFor={`location-${loc.kind}`}
                    error={errors[`locations.${i}.value`]}
                    hint={needs === "phone" ? "International format, e.g. +90 555 123 4567" : undefined}
                  >
                    <Input
                      id={`location-${loc.kind}`}
                      value={loc.value ?? ""}
                      onChange={(e) => setLocation(i, e.target.value || null)}
                    />
                  </Field>
                )}
                {loc.kind === "jitsi" && (
                  <p className="text-xs text-muted">A unique Jitsi room is created for every booking.</p>
                )}
                {loc.kind === "phone_attendee" && (
                  <p className="text-xs text-muted">Invitees enter their phone number when booking.</p>
                )}
                {requirement && !props.connectedProviders.includes(requirement.provider) && (
                  <p className="text-xs text-danger">{requirement.label} to generate links automatically.</p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex items-end gap-2">
          <Field label="Add a location" htmlFor="newLocation">
            <Select
              id="newLocation"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value as LocationKind | "")}
              className="w-72"
            >
              <option value="">Choose…</option>
              {LOCATION_KINDS.filter((k) => !usedKinds.has(k)).map((k) => (
                <option key={k} value={k}>
                  {LOCATION_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="button"
            variant="secondary"
            disabled={!newLocation}
            onClick={() => {
              if (!newLocation) return;
              set({ locations: [...form.locations, { kind: newLocation, value: null }] });
              setNewLocation("");
            }}
          >
            Add
          </Button>
        </div>
      </section>

      <QuestionsEditor
        questions={(form.questions ?? []) as Question[]}
        onChange={(questions) => set({ questions })}
        errors={errors}
      />

      <AdvancedSettings form={form} set={set} errors={errors} timeZones={timeZones} team={props.team} />

      {props.calendars.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-medium">Calendars</h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm">
              Check these calendars for conflicts (none selected = your account defaults)
            </legend>
            {props.calendars.map((cal) => (
              <label key={cal.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={calendarSettings.conflictCalendarIds.includes(cal.id)}
                  onChange={(e) =>
                    setCalendarSettings((c) => ({
                      ...c,
                      conflictCalendarIds: e.target.checked
                        ? [...c.conflictCalendarIds, cal.id]
                        : c.conflictCalendarIds.filter((x) => x !== cal.id),
                    }))
                  }
                />
                {cal.name} <span className="text-muted">({cal.account})</span>
              </label>
            ))}
          </fieldset>
          <Field label="Add new bookings to" htmlFor="destinationCalendarId" error={errors.destinationCalendarId}>
            <Select
              id="destinationCalendarId"
              value={calendarSettings.destinationCalendarId ?? ""}
              onChange={(e) => setCalendarSettings((c) => ({ ...c, destinationCalendarId: e.target.value || null }))}
            >
              <option value="">My default destination calendar</option>
              {props.calendars
                .filter((cal) => !cal.readOnly)
                .map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.name} ({cal.account})
                  </option>
                ))}
            </Select>
          </Field>
        </section>
      )}

      <div className="flex flex-col gap-3">
        {state.message && <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Saving…" : props.isNew ? "Create event type" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
