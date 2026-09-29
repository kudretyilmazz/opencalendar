"use client";

import { useActionState, useState } from "react";
import { useTimeZones } from "@/lib/use-time-zones";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
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
import { submitWithoutReset } from "@/lib/submit-without-reset";

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

/** Radix SelectItem values must be non-empty; this stands in for "use the default". */
const NONE = "__none";
const fromSelect = (value: string) => (value === NONE ? null : value);

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
    <form action={action} onSubmit={submitWithoutReset(action)} className="flex flex-col gap-8">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <section className="grid gap-4 sm:grid-cols-2">
        <FormField label="Title" htmlFor="title" error={errors.title}>
          <Input
            id="title"
            value={form.title}
            required
            maxLength={100}
            onChange={(e) => set({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
          />
        </FormField>
        <FormField label="URL" htmlFor="slug" error={errors.slug} hint={`${props.profileUrl}/${form.slug || "…"}`}>
          <Input
            id="slug"
            value={form.slug}
            required
            onChange={(e) => {
              setSlugTouched(true);
              set({ slug: e.target.value.toLowerCase() });
            }}
          />
        </FormField>
        <div className="sm:col-span-2">
          <FormField
            label="Description"
            htmlFor="description"
            error={errors.description}
            hint="Shown on your booking page. Supports Markdown: **bold**, *italic*, `code`, [links](https://…), lists (- or 1.) and # headings."
          >
            <Textarea
              id="description"
              className="min-h-24"
              value={form.description ?? ""}
              maxLength={5000}
              onChange={(e) => set({ description: e.target.value || null })}
            />
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Duration</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Default duration (minutes)" htmlFor="duration" error={errors.durationMinutes}>
            <Input
              id="duration"
              type="number"
              min={5}
              max={720}
              step={5}
              value={form.durationMinutes}
              onChange={(e) => set({ durationMinutes: num(e.target.value) })}
            />
          </FormField>
          <FormField
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
          </FormField>
        </div>
        <FieldSet className="gap-2">
          <FieldLegend variant="label">Also let bookers choose</FieldLegend>
          <div className="flex flex-wrap gap-x-4 gap-y-3">
            {DURATION_CHOICES.filter((d) => d !== form.durationMinutes).map((d) => (
              <Field key={d} orientation="horizontal" className="w-auto">
                <Checkbox
                  id={`extra-${d}`}
                  checked={form.extraDurations.includes(d)}
                  onCheckedChange={() => toggleExtra(d)}
                />
                <FieldLabel htmlFor={`extra-${d}`} className="font-normal">
                  {d} min
                </FieldLabel>
              </Field>
            ))}
          </div>
        </FieldSet>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Limits</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Buffer before (minutes)" htmlFor="bufferBefore" error={errors.bufferBeforeMinutes}>
            <Input
              id="bufferBefore"
              type="number"
              min={0}
              max={240}
              step={5}
              value={form.bufferBeforeMinutes}
              onChange={(e) => set({ bufferBeforeMinutes: num(e.target.value) })}
            />
          </FormField>
          <FormField label="Buffer after (minutes)" htmlFor="bufferAfter" error={errors.bufferAfterMinutes}>
            <Input
              id="bufferAfter"
              type="number"
              min={0}
              max={240}
              step={5}
              value={form.bufferAfterMinutes}
              onChange={(e) => set({ bufferAfterMinutes: num(e.target.value) })}
            />
          </FormField>
          <FormField label="Minimum notice" htmlFor="notice" error={errors.minNoticeMinutes}>
            <div className="flex gap-2">
              <Input
                id="notice"
                type="number"
                min={0}
                value={notice.value}
                onChange={(e) => setNotice({ ...notice, value: num(e.target.value) })}
              />
              <Select value={notice.unit} onValueChange={(unit) => setNotice({ ...notice, unit: unit as NoticeUnit })}>
                <SelectTrigger aria-label="Minimum notice unit" className="w-28 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">minutes</SelectItem>
                  <SelectItem value="hours">hours</SelectItem>
                  <SelectItem value="days">days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Bookable" htmlFor="horizonType" error={errors.horizonType}>
            <Select
              value={form.horizonType}
              onValueChange={(value) =>
                set({
                  horizonType: value as EventTypeFormInput["horizonType"],
                  horizonDays: form.horizonDays ?? 60,
                })
              }
            >
              <SelectTrigger id="horizonType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rolling_days">Up to N calendar days ahead</SelectItem>
                <SelectItem value="rolling_business_days">Up to N business days ahead</SelectItem>
                <SelectItem value="date_range">Within a date range</SelectItem>
                <SelectItem value="unlimited">Indefinitely</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          {(form.horizonType === "rolling_days" || form.horizonType === "rolling_business_days") && (
            <FormField label="Days" htmlFor="horizonDays" error={errors.horizonDays}>
              <Input
                id="horizonDays"
                type="number"
                min={1}
                max={730}
                value={form.horizonDays ?? ""}
                onChange={(e) => set({ horizonDays: e.target.value === "" ? null : num(e.target.value) })}
              />
            </FormField>
          )}
          {form.horizonType === "date_range" && (
            <>
              <FormField label="From" htmlFor="rangeStart" error={errors.rangeStart}>
                <DatePicker
                  id="rangeStart"
                  value={form.rangeStart ?? ""}
                  onValueChange={(value) => set({ rangeStart: value || null })}
                  max={form.rangeEnd ?? undefined}
                  aria-invalid={errors.rangeStart ? true : undefined}
                />
              </FormField>
              <FormField label="To" htmlFor="rangeEnd" error={errors.rangeEnd}>
                <DatePicker
                  id="rangeEnd"
                  value={form.rangeEnd ?? ""}
                  onValueChange={(value) => set({ rangeEnd: value || null })}
                  min={form.rangeStart ?? undefined}
                  aria-invalid={errors.rangeEnd ? true : undefined}
                />
              </FormField>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {!props.team && (
          <FormField label="Availability schedule" htmlFor="scheduleId" error={errors.scheduleId}>
            <Select value={form.scheduleId ?? NONE} onValueChange={(value) => set({ scheduleId: fromSelect(value) })}>
              <SelectTrigger id="scheduleId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Default schedule</SelectItem>
                {props.schedules.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.isDefault ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        <FormField label="Additional guests allowed" htmlFor="maxGuests" error={errors.maxGuests}>
          <Input
            id="maxGuests"
            type="number"
            min={0}
            max={10}
            value={form.maxGuests}
            onChange={(e) => set({ maxGuests: num(e.target.value) })}
          />
        </FormField>
        <Field orientation="horizontal" className="sm:col-span-2">
          <Checkbox id="hidden" checked={form.hidden} onCheckedChange={(v) => set({ hidden: v === true })} />
          <FieldLabel htmlFor="hidden" className="font-normal">
            Hide from my profile page (still bookable by direct link)
          </FieldLabel>
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Locations</h2>
        <p className="text-sm text-muted-foreground">
          Add one or more. With several, the invitee chooses when booking.
        </p>
        {errors.locations && (
          <Alert variant="destructive">
            <AlertDescription>{errors.locations}</AlertDescription>
          </Alert>
        )}
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
                    size="sm"
                    onClick={() => set({ locations: form.locations.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </Button>
                </div>
                {needs && (
                  <FormField
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
                  </FormField>
                )}
                {loc.kind === "jitsi" && (
                  <p className="text-xs text-muted-foreground">A unique Jitsi room is created for every booking.</p>
                )}
                {loc.kind === "phone_attendee" && (
                  <p className="text-xs text-muted-foreground">Invitees enter their phone number when booking.</p>
                )}
                {requirement && !props.connectedProviders.includes(requirement.provider) && (
                  <p className="text-xs text-destructive">{requirement.label} to generate links automatically.</p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex items-end gap-2">
          <FormField label="Add a location" htmlFor="newLocation">
            {/* "" (Radix's empty value) shows the placeholder again after "Add". */}
            <Select value={newLocation} onValueChange={(value) => setNewLocation(value as LocationKind)}>
              <SelectTrigger id="newLocation" className="w-72">
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent>
                {LOCATION_KINDS.filter((k) => !usedKinds.has(k)).map((k) => (
                  <SelectItem key={k} value={k}>
                    {LOCATION_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <Button
            type="button"
            variant="outline"
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
          <FieldSet className="gap-2">
            <FieldLegend variant="label" className="font-normal">
              Check these calendars for conflicts (none selected = your account defaults)
            </FieldLegend>
            {props.calendars.map((cal) => (
              <Field key={cal.id} orientation="horizontal">
                <Checkbox
                  id={`conflict-${cal.id}`}
                  checked={calendarSettings.conflictCalendarIds.includes(cal.id)}
                  onCheckedChange={(v) =>
                    setCalendarSettings((c) => ({
                      ...c,
                      conflictCalendarIds:
                        v === true
                          ? [...c.conflictCalendarIds, cal.id]
                          : c.conflictCalendarIds.filter((x) => x !== cal.id),
                    }))
                  }
                />
                <FieldLabel htmlFor={`conflict-${cal.id}`} className="font-normal">
                  {cal.name} <span className="text-muted-foreground">({cal.account})</span>
                </FieldLabel>
              </Field>
            ))}
          </FieldSet>
          <FormField label="Add new bookings to" htmlFor="destinationCalendarId" error={errors.destinationCalendarId}>
            <Select
              value={calendarSettings.destinationCalendarId ?? NONE}
              onValueChange={(value) =>
                setCalendarSettings((c) => ({ ...c, destinationCalendarId: fromSelect(value) }))
              }
            >
              <SelectTrigger id="destinationCalendarId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>My default destination calendar</SelectItem>
                {props.calendars
                  .filter((cal) => !cal.readOnly)
                  .map((cal) => (
                    <SelectItem key={cal.id} value={cal.id}>
                      {cal.name} ({cal.account})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </FormField>
        </section>
      )}

      <div className="flex flex-col gap-3">
        {state.message && (
          <Alert variant={state.status === "success" ? "success" : "destructive"}>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={pending} className="self-start">
          {pending && <Spinner />}
          {pending ? "Saving…" : props.isNew ? "Create event type" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
