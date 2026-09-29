"use client";

import { FormField } from "@/components/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, timeZoneOptions } from "@/components/ui/combobox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EVENT_NAME_VARIABLES, type EventTypeFormInput } from "../schemas";

type Props = {
  form: EventTypeFormInput;
  set: (patch: Partial<EventTypeFormInput>) => void;
  errors: Partial<Record<string, string>>;
  timeZones: readonly string[];
};

type Limits = NonNullable<EventTypeFormInput["bookingLimits"]>;
const PERIODS = [
  ["day", "per day"],
  ["week", "per week"],
  ["month", "per month"],
  ["year", "per year"],
] as const;

const numOrNull = (value: string) => (value === "" ? null : Number(value));

/** Radix SelectItem values must be non-empty; stands in for "Off". */
const OFF = "__off";

function Check({
  id,
  label,
  checked,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <FieldContent>
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
        {hint && (
          <FieldDescription id={`${id}-hint`} className="text-xs">
            {hint}
          </FieldDescription>
        )}
      </FieldContent>
    </Field>
  );
}

function LimitsFields({
  idPrefix,
  legend,
  unit,
  value,
  onChange,
}: {
  idPrefix: string;
  legend: string;
  unit: string;
  value: Limits;
  onChange: (v: Limits) => void;
}) {
  return (
    <FieldSet className="grid gap-3 sm:grid-cols-4">
      <FieldLegend variant="label" className="sm:col-span-4">
        {legend}
      </FieldLegend>
      {PERIODS.map(([period, label]) => (
        <FormField key={period} label={`${unit} ${label}`} htmlFor={`${idPrefix}-${period}`}>
          <Input
            id={`${idPrefix}-${period}`}
            type="number"
            min={1}
            value={value[period] ?? ""}
            onChange={(e) => {
              const { [period]: _drop, ...rest } = value;
              onChange(e.target.value === "" ? rest : { ...rest, [period]: Number(e.target.value) });
            }}
          />
        </FormField>
      ))}
    </FieldSet>
  );
}

/**
 * M3 event type options: confirmation (EVT-011), seats (EVT-012), recurring (EVT-013), limits
 * (EVT-010), single-use links only (EVT-015), redirect (EVT-016) and booking policies (EVT-017).
 */
export function AdvancedSettings({ form, set, errors, timeZones, team }: Props & { team?: boolean }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="font-medium">Advanced</h2>

      <div className="flex flex-col gap-2">
        <Check
          id="requiresConfirmation"
          label="Requires confirmation"
          hint="New bookings wait until you accept them."
          checked={Boolean(form.requiresConfirmation)}
          onChange={(v) => set({ requiresConfirmation: v })}
        />
        {form.requiresConfirmation && (
          <FormField
            label="Only when the booking starts within (hours)"
            htmlFor="confirmationThreshold"
            hint="Leave empty to always require confirmation."
            error={errors.confirmationThresholdMinutes}
          >
            <Input
              id="confirmationThreshold"
              type="number"
              min={1}
              className="w-40"
              value={form.confirmationThresholdMinutes ? form.confirmationThresholdMinutes / 60 : ""}
              onChange={(e) =>
                set({
                  confirmationThresholdMinutes: e.target.value === "" ? null : Math.round(Number(e.target.value) * 60),
                })
              }
            />
          </FormField>
        )}
      </div>

      {!team && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label="Seats per time slot"
              htmlFor="seatsPerSlot"
              hint="For group events: several people book the same time. Leave empty for 1:1."
              error={errors.seatsPerSlot}
            >
              <Input
                id="seatsPerSlot"
                type="number"
                min={1}
                max={1000}
                value={form.seatsPerSlot ?? ""}
                onChange={(e) => set({ seatsPerSlot: numOrNull(e.target.value) })}
              />
            </FormField>
            {form.seatsPerSlot ? (
              <div className="flex items-end pb-2">
                <Check
                  id="seatsShowAttendees"
                  label="Attendees can see each other"
                  checked={Boolean(form.seatsShowAttendees)}
                  onChange={(v) => set({ seatsShowAttendees: v })}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Recurring bookings" htmlFor="recurringFrequency" error={errors.recurringFrequency}>
              <Select
                value={form.recurringFrequency ?? OFF}
                onValueChange={(value) => {
                  const v = value === OFF ? null : (value as "weekly" | "monthly");
                  set({ recurringFrequency: v, recurringMaxCount: v ? (form.recurringMaxCount ?? 4) : null });
                }}
              >
                <SelectTrigger id="recurringFrequency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OFF}>Off</SelectItem>
                  <SelectItem value="weekly">Invitees can book weekly repeats</SelectItem>
                  <SelectItem value="monthly">Invitees can book monthly repeats</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {form.recurringFrequency && (
              <FormField label="Maximum occurrences" htmlFor="recurringMaxCount" error={errors.recurringMaxCount}>
                <Input
                  id="recurringMaxCount"
                  type="number"
                  min={2}
                  max={52}
                  value={form.recurringMaxCount ?? ""}
                  onChange={(e) => set({ recurringMaxCount: numOrNull(e.target.value) })}
                />
              </FormField>
            )}
          </div>
        </>
      )}

      <LimitsFields
        idPrefix="limit-bookings"
        legend="Limit booking frequency"
        unit="Bookings"
        value={form.bookingLimits ?? {}}
        onChange={(v) => set({ bookingLimits: v })}
      />
      <LimitsFields
        idPrefix="limit-minutes"
        legend="Limit total booked time"
        unit="Minutes"
        value={form.durationLimits ?? {}}
        onChange={(v) => set({ durationLimits: v })}
      />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Booking policies</h3>
        <Check
          id="disableCancelling"
          label="Invitees can't cancel online"
          checked={Boolean(form.disableCancelling)}
          onChange={(v) => set({ disableCancelling: v })}
        />
        <Check
          id="disableRescheduling"
          label="Invitees can't reschedule online"
          checked={Boolean(form.disableRescheduling)}
          onChange={(v) => set({ disableRescheduling: v })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="No self-service changes within (hours of the start)"
            htmlFor="cancelCutoff"
            error={errors.cancelCutoffMinutes}
          >
            <Input
              id="cancelCutoff"
              type="number"
              min={1}
              value={form.cancelCutoffMinutes ? form.cancelCutoffMinutes / 60 : ""}
              onChange={(e) =>
                set({ cancelCutoffMinutes: e.target.value === "" ? null : Math.round(Number(e.target.value) * 60) })
              }
            />
          </FormField>
          <FormField
            label="Always show times in"
            htmlFor="lockTimeZone"
            hint="Leave empty to use the invitee's time zone."
            error={errors.lockTimeZone}
          >
            <Combobox
              id="lockTimeZone"
              options={[{ value: "", label: "The invitee's time zone" }, ...timeZoneOptions(timeZones)]}
              value={form.lockTimeZone ?? ""}
              onValueChange={(value) => set({ lockTimeZone: value || null })}
              searchPlaceholder="Search time zones…"
              aria-invalid={errors.lockTimeZone ? true : undefined}
            />
          </FormField>
        </div>
        <FormField
          label="Event name in calendars"
          htmlFor="eventNameTemplate"
          hint={`Variables: ${EVENT_NAME_VARIABLES.join(" ")}. Leave empty for "{event} between {host} and {attendee}".`}
          error={errors.eventNameTemplate}
        >
          <Input
            id="eventNameTemplate"
            maxLength={200}
            value={form.eventNameTemplate ?? ""}
            onChange={(e) => set({ eventNameTemplate: e.target.value || null })}
          />
        </FormField>
      </div>

      <div className="flex flex-col gap-3">
        <FormField
          label="After booking, redirect to"
          htmlFor="redirectUrl"
          hint="An https:// page of yours instead of the confirmation page."
          error={errors.redirectUrl}
        >
          <Input
            id="redirectUrl"
            type="url"
            value={form.redirectUrl ?? ""}
            onChange={(e) => set({ redirectUrl: e.target.value || null })}
          />
        </FormField>
        {form.redirectUrl && (
          <Check
            id="redirectForwardParams"
            label="Add booking details to the redirect URL"
            hint="uid, title, start, end, status, type, name and email as query parameters."
            checked={Boolean(form.redirectForwardParams)}
            onChange={(v) => set({ redirectForwardParams: v })}
          />
        )}
      </div>

      {!team && (
        <Check
          id="linkOnly"
          label="Only bookable with a single-use link"
          hint="Create links below after saving. Each link books once."
          checked={Boolean(form.linkOnly)}
          onChange={(v) => set({ linkOnly: v })}
        />
      )}
    </section>
  );
}
