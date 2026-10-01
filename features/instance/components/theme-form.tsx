"use client";

import { useState } from "react";
import { SettingsSection } from "@/features/settings/components/settings-section";
import { cn } from "@/lib/cn";
import type { ResolvedSettings } from "../defaults";
import { saveThemeAction } from "../server/actions";
import { contrastRatio, HEX_COLOR, readableForeground, UI_CONTRAST } from "../theme/contrast";
import { BACKGROUNDS, type Scheme, textShade } from "../theme/css";
import { AdminForm, ColorField, fieldsCardClass, SelectField } from "./admin-form";

/** globals.css defaults, shown as placeholders and used by the preview when a field is blank. */
const DEFAULTS = {
  light: { primary: "#111827", highlight: "#4f46e5" },
  dark: { primary: "#f8fafc", highlight: "#4f46e5" },
} as const;

const RADIUS_OPTIONS = { default: "Default", "0rem": "Square", "0.375rem": "Small", "0.625rem": "Medium", "1rem": "Large" };
const THEME_OPTIONS = { system: "Follow the device", light: "Light", dark: "Dark" };

function Preview({ scheme, primary, highlight, radius }: { scheme: Scheme; primary: string; highlight: string; radius: string }) {
  const background = BACKGROUNDS[scheme];
  const p = HEX_COLOR.test(primary) ? primary : DEFAULTS[scheme].primary;
  const h = HEX_COLOR.test(highlight) ? highlight : DEFAULTS[scheme].highlight;
  const ratio = contrastRatio(p, background);
  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-border p-4"
      style={{ backgroundColor: background, color: scheme === "dark" ? "#e5e7eb" : "#0f172a" }}
      aria-label={`${scheme === "dark" ? "Dark" : "Light"} preview`}
    >
      <span className="text-xs font-medium tracking-wide uppercase opacity-70">{scheme}</span>
      <div className="flex flex-wrap items-center gap-3">
        <span className="px-3.5 py-2 text-sm font-medium" style={{ backgroundColor: p, color: readableForeground(p), borderRadius: radius || "0.625rem" }}>
          Book a time
        </span>
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: h, color: readableForeground(h) }}>
          3
        </span>
        <span className="text-sm underline" style={{ color: textShade(h, background) }}>
          A link
        </span>
      </div>
      <span className={cn("text-xs", ratio < UI_CONTRAST ? "font-medium text-[#b91c1c]" : "opacity-70")}>
        Button contrast {ratio.toFixed(1)}:1 {ratio < UI_CONTRAST ? `— needs ${UI_CONTRAST}:1` : "✓"}
      </span>
    </div>
  );
}

export function ThemeForm({ settings }: { settings: Pick<ResolvedSettings, "theme" | "radius" | "defaultTheme"> }) {
  const [colors, setColors] = useState({
    lightPrimary: settings.theme.light?.primary ?? "",
    lightHighlight: settings.theme.light?.highlight ?? "",
    darkPrimary: settings.theme.dark?.primary ?? "",
    darkHighlight: settings.theme.dark?.highlight ?? "",
  });
  const radius = settings.radius ?? "";
  const set = (key: keyof typeof colors) => (value: string) => setColors((c) => ({ ...c, [key]: value }));

  return (
    <AdminForm id="theme-settings" title="Theme" description="Brand colors and shape for every page. Text colors are derived for readability." action={saveThemeAction}>
      <SettingsSection id="colors" title="Colors" description="Primary colors buttons and focus rings; highlight colors badges, links and progress. Team and embed brand colors still win on their booking pages.">
        <div className={fieldsCardClass}>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField name="lightPrimary" label="Primary (light)" defaultValue={colors.lightPrimary} placeholder={DEFAULTS.light.primary} onValueChange={set("lightPrimary")} />
            <ColorField name="lightHighlight" label="Highlight (light)" defaultValue={colors.lightHighlight} placeholder={DEFAULTS.light.highlight} onValueChange={set("lightHighlight")} />
            <ColorField name="darkPrimary" label="Primary (dark)" defaultValue={colors.darkPrimary} placeholder={DEFAULTS.dark.primary} onValueChange={set("darkPrimary")} />
            <ColorField name="darkHighlight" label="Highlight (dark)" defaultValue={colors.darkHighlight} placeholder={DEFAULTS.dark.highlight} onValueChange={set("darkHighlight")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Preview scheme="light" primary={colors.lightPrimary} highlight={colors.lightHighlight} radius={radius} />
            <Preview scheme="dark" primary={colors.darkPrimary} highlight={colors.darkHighlight} radius={radius} />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="shape" title="Shape and mode" description="Corner rounding, and the color mode for visitors who haven't picked one. Signed-in users' own choice wins.">
        <div className={cn(fieldsCardClass, "grid gap-4 sm:grid-cols-2")}>
          <SelectField name="radius" label="Corner radius" defaultValue={settings.radius ?? "default"} options={RADIUS_OPTIONS} />
          <SelectField name="defaultTheme" label="Default color mode" defaultValue={settings.defaultTheme} options={THEME_OPTIONS} />
        </div>
      </SettingsSection>
    </AdminForm>
  );
}
