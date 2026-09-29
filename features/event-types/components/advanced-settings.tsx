"use client";

import { Field, Input, Select } from "@/components/ui/primitives";
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

function Check({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
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
    <fieldset className="grid gap-3 sm:grid-cols-4">
      <legend className="mb-1 text-sm font-medium sm:col-span-4">{legend}</legend>
      {PERIODS.map(([period, label]) => (
        <Field key={period} label={`${unit} ${label}`} htmlFor={`${idPrefix}-${period}`}>
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
        </Field>
      ))}
    </fieldset>
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
          label="Requires confirmation"
          hint="New bookings wait until you accept them."
          checked={Boolean(form.requiresConfirmation)}
          onChange={(v) => set({ requiresConfirmation: v })}
        />
        {form.requiresConfirmation && (
          <Field
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
          </Field>
        )}
      </div>

      {!team && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
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
            </Field>
            {form.seatsPerSlot ? (
              <div className="flex items-end pb-2">
                <Check
                  label="Attendees can see each other"
                  checked={Boolean(form.seatsShowAttendees)}
                  onChange={(v) => set({ seatsShowAttendees: v })}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Recurring bookings" htmlFor="recurringFrequency" error={errors.recurringFrequency}>
              <Select
                id="recurringFrequency"
                value={form.recurringFrequency ?? ""}
                onChange={(e) => {
                  const v = e.target.value as "weekly" | "monthly" | "";
                  set({ recurringFrequency: v || null, recurringMaxCount: v ? (form.recurringMaxCount ?? 4) : null });
                }}
              >
                <option value="">Off</option>
                <option value="weekly">Invitees can book weekly repeats</option>
                <option value="monthly">Invitees can book monthly repeats</option>
              </Select>
            </Field>
            {form.recurringFrequency && (
              <Field label="Maximum occurrences" htmlFor="recurringMaxCount" error={errors.recurringMaxCount}>
                <Input
                  id="recurringMaxCount"
                  type="number"
                  min={2}
                  max={52}
                  value={form.recurringMaxCount ?? ""}
                  onChange={(e) => set({ recurringMaxCount: numOrNull(e.target.value) })}
                />
              </Field>
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
          label="Invitees can't cancel online"
          checked={Boolean(form.disableCancelling)}
          onChange={(v) => set({ disableCancelling: v })}
        />
        <Check
          label="Invitees can't reschedule online"
          checked={Boolean(form.disableRescheduling)}
          onChange={(v) => set({ disableRescheduling: v })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
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
          </Field>
          <Field
            label="Always show times in"
            htmlFor="lockTimeZone"
            hint="Leave empty to use the invitee's time zone."
            error={errors.lockTimeZone}
          >
            <Input
              id="lockTimeZone"
              list="lock-tz-options"
              value={form.lockTimeZone ?? ""}
              onChange={(e) => set({ lockTimeZone: e.target.value || null })}
            />
            <datalist id="lock-tz-options">
              {timeZones.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field
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
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <Field
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
        </Field>
        {form.redirectUrl && (
          <Check
            label="Add booking details to the redirect URL"
            hint="uid, title, start, end, status, type, name and email as query parameters."
            checked={Boolean(form.redirectForwardParams)}
            onChange={(v) => set({ redirectForwardParams: v })}
          />
        )}
      </div>

      {!team && (
        <Check
          label="Only bookable with a single-use link"
          hint="Create links below after saving. Each link books once."
          checked={Boolean(form.linkOnly)}
          onChange={(v) => set({ linkOnly: v })}
        />
      )}
    </section>
  );
}
