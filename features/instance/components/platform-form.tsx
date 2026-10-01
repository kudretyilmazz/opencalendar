"use client";

import { FormField } from "@/components/form-field";
import { Combobox, timeZoneOptions } from "@/components/ui/combobox";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { cn } from "@/lib/cn";
import type { SignupMode } from "@/lib/auth/policy";
import { DEFAULT_SETTINGS, type ResolvedSettings } from "../defaults";
import { savePlatformAction } from "../server/actions";
import { AdminForm, FIELD_CLASS, fieldsCardClass, SelectField, SwitchField, TextField } from "./admin-form";

const MODE_LABELS: Record<SignupMode, string> = { open: "Open to everyone", invite_only: "Invite only", disabled: "Closed" };

type Props = {
  settings: ResolvedSettings;
  envSignupMode: SignupMode;
  providers: ("google" | "microsoft")[];
  timeZones: string[];
};

export function PlatformForm({ settings, envSignupMode, providers, timeZones }: Props) {
  return (
    <AdminForm id="platform-settings" title="Platform" description="Who can join, what visitors read first, and defaults for new accounts." action={savePlatformAction}>
      <SettingsSection id="signup" title="Sign-ups" description="The first account always becomes the administrator, whatever the mode.">
        <div className={fieldsCardClass}>
          <SelectField
            name="signupMode"
            label="Who can create an account"
            defaultValue={settings.signupMode ?? "env"}
            options={{ env: `Server default (${MODE_LABELS[envSignupMode]})`, ...MODE_LABELS }}
            hint="Invite only: people a team invited can join with a sign-in link or OAuth."
          />
          {providers.length > 0 && (
            <div className="flex flex-col gap-4">
              {providers.includes("google") && (
                <SwitchField
                  name="oauthGoogleHidden"
                  label="Hide “Continue with Google”"
                  hint="Only hides the button; remove the Google credentials from the server to turn it off."
                  defaultChecked={settings.oauthGoogleHidden}
                />
              )}
              {providers.includes("microsoft") && (
                <SwitchField
                  name="oauthMicrosoftHidden"
                  label="Hide “Continue with Microsoft”"
                  hint="Only hides the button; remove the Microsoft credentials from the server to turn it off."
                  defaultChecked={settings.oauthMicrosoftHidden}
                />
              )}
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection id="texts" title="Texts" description="Plain text; leave a field blank for the default.">
        <div className={fieldsCardClass}>
          <TextField name="landingHeadline" label="Home page headline" defaultValue={settings.landingHeadline === DEFAULT_SETTINGS.landingHeadline ? "" : settings.landingHeadline} placeholder={DEFAULT_SETTINGS.landingHeadline} maxLength={120} />
          <TextField name="landingBody" label="Home page text" defaultValue={settings.landingBody === DEFAULT_SETTINGS.landingBody ? "" : settings.landingBody} placeholder={DEFAULT_SETTINGS.landingBody} maxLength={600} multiline />
          <TextField name="loginMessage" label="Sign-in notice" defaultValue={settings.loginMessage ?? ""} hint="Shown above the sign-in and sign-up forms, e.g. who to contact for access." maxLength={300} multiline />
        </div>
      </SettingsSection>

      <SettingsSection id="defaults" title="New account defaults" description="Applied when an account is created; people can change them in their settings.">
        <div className={cn(fieldsCardClass, "grid gap-4 sm:grid-cols-3")}>
          <FormField label="Time zone" htmlFor="defaultTimeZone">
            <Combobox
              id="defaultTimeZone"
              name="defaultTimeZone"
              options={[{ value: "default", label: "UTC (default)" }, ...timeZoneOptions(timeZones)]}
              defaultValue={settings.defaultTimeZone ?? "default"}
              searchPlaceholder="Search time zones…"
              emptyText="No time zone found."
              className={FIELD_CLASS}
            />
          </FormField>
          <SelectField name="defaultWeekStart" label="Week starts on" defaultValue={String(settings.defaultWeekStart ?? "default")} options={[["default", "Monday (default)"], ["0", "Sunday"], ["1", "Monday"], ["6", "Saturday"]]} />
          <SelectField name="defaultTimeFormat" label="Time format" defaultValue={String(settings.defaultTimeFormat ?? "default")} options={[["default", "24-hour (default)"], ["12", "12-hour"], ["24", "24-hour"]]} />
        </div>
      </SettingsSection>
    </AdminForm>
  );
}
