import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { ThemeForm } from "@/features/instance/components/theme-form";
import { loadInstanceSettings } from "@/features/instance/server/service";

export const metadata: Metadata = { title: "Theme" };

export default async function ThemePage() {
  const settings = await loadInstanceSettings(getDb());
  return <ThemeForm settings={settings} />;
}
