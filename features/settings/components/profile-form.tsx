"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui/primitives";
import type { Profile } from "../server/service";
import { type ProfileActionState, saveProfileAction } from "../server/actions";

const WEEK_START_LABELS: Record<number, string> = { 0: "Sunday", 1: "Monday", 6: "Saturday" };
const LOCALE_LABELS: Record<string, string> = { en: "English", tr: "Türkçe" };

export function ProfileForm({ profile, timeZones }: { profile: Profile; timeZones: string[] }) {
  const [state, action, pending] = useActionState<ProfileActionState, FormData>(saveProfileAction, { status: "idle" });
  // The saved theme is applied by <ThemeSync> in the dashboard layout after revalidation.
  const errors = state.fieldErrors ?? {};

  const invalid = (name: string) => (errors[name] ? { "aria-invalid": true, "aria-describedby": `${name}-error` } : {});

  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <Field label="Name" htmlFor="name" error={errors.name}>
        <Input id="name" name="name" defaultValue={profile.name} required maxLength={100} {...invalid("name")} />
      </Field>
      <Field label="Username" htmlFor="username" error={errors.username} hint="Your booking page will live at /your-username.">
        <Input id="username" name="username" defaultValue={profile.username ?? ""} required minLength={3} maxLength={32} {...invalid("username")} />
      </Field>
      <Field label="Time zone" htmlFor="timeZone" error={errors.timeZone}>
        <Select id="timeZone" name="timeZone" defaultValue={profile.timeZone}>
          {timeZones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Language" htmlFor="locale" error={errors.locale}>
        <Select id="locale" name="locale" defaultValue={profile.locale}>
          {Object.entries(LOCALE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Week starts on" htmlFor="weekStart" error={errors.weekStart}>
        <Select id="weekStart" name="weekStart" defaultValue={String(profile.weekStart)}>
          {Object.entries(WEEK_START_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Time format" htmlFor="timeFormat" error={errors.timeFormat}>
        <Select id="timeFormat" name="timeFormat" defaultValue={String(profile.timeFormat)}>
          <option value="24">24-hour (14:30)</option>
          <option value="12">12-hour (2:30 PM)</option>
        </Select>
      </Field>
      <Field label="Theme" htmlFor="theme" error={errors.theme}>
        <Select id="theme" name="theme" defaultValue={profile.theme}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </Select>
      </Field>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="allowDynamicGroup" defaultChecked={profile.allowDynamicGroup} className="mt-1" />
        <span>
          Allow group links with teammates
          <span className="block text-xs text-muted">People can book you together with members of your teams at /you+teammate, on your default schedule.</span>
        </span>
      </label>
      <div className="flex flex-col gap-3 sm:col-span-2">
        {state.message && <Alert tone={state.status === "success" ? "success" : "error"}>{state.message}</Alert>}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
