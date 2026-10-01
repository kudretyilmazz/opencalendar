import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { enabledSocialProviders } from "@/features/auth/server/queries";
import { PlatformForm } from "@/features/instance/components/platform-form";
import { loadInstanceSettings } from "@/features/instance/server/service";
import { listTimeZones } from "@/features/settings/schemas";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Platform" };

export default async function PlatformPage() {
  const env = getEnv();
  const settings = await loadInstanceSettings(getDb());
  return <PlatformForm settings={settings} envSignupMode={env.SIGNUP_MODE} providers={enabledSocialProviders(env)} timeZones={listTimeZones()} />;
}
