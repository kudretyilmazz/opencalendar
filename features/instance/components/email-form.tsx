"use client";

import { useState } from "react";
import { SettingsSection } from "@/features/settings/components/settings-section";
import type { ResolvedSettings } from "../defaults";
import { emailFooter } from "../email-branding";
import { saveEmailAction } from "../server/actions";
import { HEX_COLOR, readableForeground } from "../theme/contrast";
import { AdminForm, ColorField, fieldsCardClass, TextField } from "./admin-form";

type Props = { settings: Pick<ResolvedSettings, "appName" | "emailFooterText" | "emailButtonColor"> };

export function EmailForm({ settings }: Props) {
  const [color, setColor] = useState(settings.emailButtonColor === "#111827" ? "" : settings.emailButtonColor);
  const button = HEX_COLOR.test(color) ? color : "#111827";
  return (
    <AdminForm id="email-settings" title="Emails" description="How booking and account emails look. They use the app name and the logo from Branding." action={saveEmailAction}>
      <SettingsSection id="email-look" title="Look" description="The logo is included when it is a PNG, JPEG or WebP (email apps don't show SVG).">
        <div className={fieldsCardClass}>
          <ColorField name="emailButtonColor" label="Button color" defaultValue={color} placeholder="#111827" onValueChange={setColor} />
          <TextField
            name="emailFooterText"
            label="Footer text"
            defaultValue={settings.emailFooterText ?? ""}
            maxLength={300}
            placeholder={emailFooter({ ...settings, emailFooterText: null }, "account")}
            hint="Replaces the “Sent by …” line at the bottom of every email. Leave blank for the default."
            multiline
          />
          <div className="flex flex-col items-start gap-3 rounded-md border border-border bg-[#f6f7f9] p-4 text-[#334155]" aria-label="Email preview">
            <span className="text-sm">Your meeting is booked.</span>
            <span className="rounded-md px-4 py-2 text-sm" style={{ backgroundColor: button, color: readableForeground(button) }}>
              Reschedule or cancel
            </span>
          </div>
        </div>
      </SettingsSection>
    </AdminForm>
  );
}
