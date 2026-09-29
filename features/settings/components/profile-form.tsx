"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/form-field";
import { HEADER_BUTTON_CLASS, PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, timeZoneOptions } from "@/components/ui/combobox";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { initials } from "../display";
import type { Profile } from "../server/service";
import { type ProfileActionState, saveProfileAction } from "../server/actions";
import { ThemeTiles, TimeFormatField, ZoneClock } from "./preference-controls";
import { SettingsSection, settingsCardClass } from "./settings-section";

const FORM_ID = "profile-settings";
const WEEK_START_LABELS: Record<number, string> = { 0: "Sunday", 1: "Monday", 6: "Saturday" };
const LOCALE_LABELS: Record<string, string> = { en: "English", tr: "Türkçe" };
/** Design field height: 40px, 8px corners. */
const FIELD_CLASS = "h-10 rounded-md";
const fieldsCardClass = cn(settingsCardClass, "flex flex-col gap-5 p-4 md:px-6 md:py-5");

type SelectFieldProps = {
  id: string;
  label: string;
  error?: string;
  defaultValue: string;
  options: Record<string, string>;
  invalid: Record<string, unknown>;
};

/**
 * A labelled shadcn Select that submits `id` as its field name. Keyed on the saved value: Radix
 * resets to its mount-time value when React resets the form after the action, so it must remount
 * once a save changes the value (a native <select> followed its new `defaultValue` on its own).
 */
function SelectField({ id, label, error, defaultValue, options, invalid }: SelectFieldProps) {
  return (
    <FormField label={label} htmlFor={id} error={error}>
      <Select key={defaultValue} name={id} defaultValue={defaultValue}>
        <SelectTrigger id={id} className={cn("w-full data-[size=default]:h-10", FIELD_CLASS)} {...invalid}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([value, optionLabel]) => (
            <SelectItem key={value} value={value}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}

type ProfileFormProps = {
  profile: Profile;
  timeZones: string[];
  /** Public host shown before the username, e.g. "cal.example.com". */
  host: string;
  isAdmin: boolean;
};

/** Page header (with the save button) and the Profile, Region, Appearance and Booking sections. */
export function ProfileForm({ profile, timeZones, host, isAdmin }: ProfileFormProps) {
  const [dirty, setDirty] = useState(false);
  const [timeZone, setTimeZone] = useState(profile.timeZone);
  const [timeFormat, setTimeFormat] = useState(String(profile.timeFormat));
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(async (prev, formData) => {
    const result = await saveProfileAction(prev, formData);
    if (result.status === "success") setDirty(false);
    return result;
  }, { status: "idle" });
  // The saved theme is applied by <ThemeSync> in the dashboard layout after revalidation.
  const errors = state.fieldErrors ?? {};
  const markDirty = () => setDirty(true);
  const invalid = (name: string) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {});

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile and how dates and times are shown to you and your invitees."
        actions={
          <>
            {dirty && <span className="text-[13px] text-muted-foreground">Unsaved changes</span>}
            <Button type="submit" form={FORM_ID} disabled={pending} className={HEADER_BUTTON_CLASS}>
              {pending && <Spinner />}
              {pending ? "Saving…" : "Save settings"}
            </Button>
          </>
        }
      />
      {state.message && (
        <Alert variant={state.status === "success" ? "success" : "destructive"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <form id={FORM_ID} action={action} onChange={markDirty} className="flex flex-col gap-5 md:gap-7">
        <SettingsSection id="profile" title="Profile" description="Shown on your booking page and in emails.">
          <div className={fieldsCardClass}>
            <div className="flex items-center gap-4">
              <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold">
                {initials(profile.name)}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{profile.name}</span>
                <span className="truncate text-[13px] text-muted-foreground">
                  {profile.email}
                  {isAdmin && " · Instance administrator"}
                </span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Name" htmlFor="name" error={errors.name}>
                <Input id="name" name="name" defaultValue={profile.name} required maxLength={100} className={FIELD_CLASS} {...invalid("name")} />
              </FormField>
              <FormField label="Username" htmlFor="username" error={errors.username}>
                <InputGroup className={cn(FIELD_CLASS, "has-[>[data-align=inline-start]]:[&>input]:pl-3")}>
                  <InputGroupAddon className="h-full max-w-[55%] self-stretch rounded-l-[7px] border-r border-input bg-background px-3 font-normal">
                    <span className="truncate">{host}/</span>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="username"
                    name="username"
                    defaultValue={profile.username ?? ""}
                    required
                    minLength={3}
                    maxLength={32}
                    className="h-full px-3"
                    {...invalid("username")}
                  />
                </InputGroup>
              </FormField>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection id="region" title="Region and time" description="Your booking page opens in the invitee's own time zone; these are yours.">
          <div className={cn(fieldsCardClass, "grid gap-4 sm:grid-cols-2")}>
            <FormField label="Time zone" htmlFor="timeZone" error={errors.timeZone}>
              <div className="relative">
                <Combobox
                  key={profile.timeZone}
                  id="timeZone"
                  name="timeZone"
                  options={timeZoneOptions(timeZones)}
                  defaultValue={profile.timeZone}
                  onValueChange={(value) => {
                    setTimeZone(value);
                    markDirty();
                  }}
                  searchPlaceholder="Search time zones…"
                  emptyText="No time zone found."
                  className={cn(FIELD_CLASS, "pr-36 [&>svg]:hidden")}
                  {...invalid("timeZone")}
                />
                <ZoneClock
                  timeZone={timeZone}
                  hour12={timeFormat === "12"}
                  className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground"
                />
              </div>
            </FormField>
            <SelectField id="locale" label="Language" error={errors.locale} defaultValue={profile.locale} options={LOCALE_LABELS} invalid={invalid("locale")} />
            <SelectField
              id="weekStart"
              label="Week starts on"
              error={errors.weekStart}
              defaultValue={String(profile.weekStart)}
              options={WEEK_START_LABELS}
              invalid={invalid("weekStart")}
            />
            <div className="flex flex-col gap-1.5">
              <TimeFormatField
                defaultValue={String(profile.timeFormat)}
                onValueChange={(value) => {
                  setTimeFormat(value);
                  markDirty();
                }}
                invalid={Boolean(errors.timeFormat)}
              />
              {errors.timeFormat && <FieldError>{errors.timeFormat}</FieldError>}
            </div>
          </div>
        </SettingsSection>

        <SettingsSection id="appearance" title="Appearance" description="Only changes how the dashboard looks to you.">
          <div className={settingsCardClass}>
            <ThemeTiles defaultValue={profile.theme} onValueChange={markDirty} />
            {errors.theme && <FieldError className="px-6 pb-4">{errors.theme}</FieldError>}
          </div>
        </SettingsSection>

        <SettingsSection id="booking" title="Booking" description="How others can book you.">
          <div className={cn(settingsCardClass, "flex items-center gap-4 p-4 md:px-6 md:py-5")}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="allowDynamicGroup" className="text-sm font-medium">
                Allow group bookings with you
              </label>
              <span id="allowDynamicGroup-hint" className="text-[13px] text-muted-foreground">
                Teammates can be booked together with you, e.g. {host}/{profile.username ?? "you"}+teammate, on your default schedule.
              </span>
            </div>
            <Switch
              key={String(profile.allowDynamicGroup)}
              id="allowDynamicGroup"
              name="allowDynamicGroup"
              defaultChecked={profile.allowDynamicGroup}
              onCheckedChange={markDirty}
              aria-describedby="allowDynamicGroup-hint"
            />
          </div>
        </SettingsSection>
      </form>
    </>
  );
}
