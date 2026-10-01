"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SettingsSection } from "@/features/settings/components/settings-section";
import type { ResolvedSettings } from "../defaults";
import { saveBrandingAction } from "../server/actions";
import { AdminForm, fieldsCardClass, SwitchField, TextField } from "./admin-form";

type Props = { settings: Pick<ResolvedSettings, "appName" | "description" | "hidePoweredBy" | "hideSourceLink">; sourceUrl: string };

export function BrandingForm({ settings, sourceUrl }: Props) {
  const [hideSource, setHideSource] = useState(settings.hideSourceLink);
  return (
    <AdminForm id="branding-settings" title="Branding" description="The name, logo and footer people see on every page." action={saveBrandingAction}>
      <SettingsSection id="identity" title="Identity" description="Used in page titles, headers and emails.">
        <div className={fieldsCardClass}>
          <TextField name="appName" label="App name" defaultValue={settings.appName} maxLength={60} required />
          <TextField
            name="description"
            label="Description"
            defaultValue={settings.description}
            maxLength={200}
            hint="Shown to search engines and link previews. Leave blank for the default."
            multiline
          />
        </div>
      </SettingsSection>

      <SettingsSection id="footer" title="Footer" description="The line at the bottom of booking, sign-in and dashboard pages.">
        <div className={fieldsCardClass}>
          <SwitchField
            name="hidePoweredBy"
            label="Hide “Powered by OpenCalendar”"
            hint="Removes the attribution text from the footer."
            defaultChecked={settings.hidePoweredBy}
          />
          <SwitchField
            name="hideSourceLink"
            label="Hide the source code link"
            hint="The footer links to an About page instead, which always offers the source code."
            defaultChecked={settings.hideSourceLink}
            onCheckedChange={setHideSource}
          />
          {hideSource && (
            <Alert>
              <AlertDescription>
                If this server runs a modified version of OpenCalendar, the AGPL-3.0 (section 13) requires you to offer
                its source code to everyone who uses it. The link stays on <Link href="/about" className="underline">/about</Link>;
                make sure SOURCE_URL points to your fork (currently {sourceUrl}).
              </AlertDescription>
            </Alert>
          )}
        </div>
      </SettingsSection>
    </AdminForm>
  );
}
