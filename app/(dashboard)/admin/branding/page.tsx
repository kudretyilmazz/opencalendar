import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { AssetUploads } from "@/features/instance/components/asset-uploads";
import { BrandingForm } from "@/features/instance/components/branding-form";
import { assetUrl } from "@/features/instance/defaults";
import { loadInstanceSettings } from "@/features/instance/server/service";
import { getEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingPage() {
  // Uncached: the admin sees exactly what is saved.
  const settings = await loadInstanceSettings(getDb());
  const url = (kind: Parameters<typeof assetUrl>[1]) => (settings.assets[kind] ? assetUrl(settings, kind) : null);
  return (
    <>
      <BrandingForm settings={settings} sourceUrl={getEnv().SOURCE_URL} />
      <AssetUploads
        slots={[
          { kind: "logo", label: "Logo", hint: "Replaces the icon and name in headers. About 30px tall is shown.", url: url("logo") },
          { kind: "logo_dark", label: "Logo for dark mode", hint: "Optional; used on dark backgrounds.", url: url("logo_dark"), dark: true },
          { kind: "favicon", label: "Favicon", hint: "The browser tab icon.", url: url("favicon") },
          { kind: "apple_icon", label: "Home screen icon", hint: "180×180 PNG for iOS home screens.", url: url("apple_icon") },
        ]}
      />
    </>
  );
}
