import { assetUrl, DEFAULT_SETTINGS, type ResolvedSettings } from "./defaults";
import { readableForeground } from "./theme/contrast";

/** What transactional emails need from the instance branding (ADM-011). */
export type EmailBranding = {
  appName: string;
  /** Absolute URL of a raster logo; null for none or SVG (most email clients don't render SVG). */
  logoUrl: string | null;
  buttonColor: string;
  buttonTextColor: string;
  accountFooter: string;
  bookingFooter: string;
};

type BrandingSource = Pick<ResolvedSettings, "appName" | "emailFooterText" | "emailButtonColor" | "assets">;

export function emailFooter(settings: Pick<ResolvedSettings, "appName" | "emailFooterText">, kind: "account" | "booking"): string {
  if (settings.emailFooterText) return settings.emailFooterText;
  return kind === "booking"
    ? `Sent by ${settings.appName} on behalf of your host.`
    : `Sent by ${settings.appName}. If you didn’t request this, you can ignore it.`;
}

export function emailBranding(settings: BrandingSource, appUrl: string): EmailBranding {
  const logo = settings.assets.logo;
  const raster = logo && logo.mimeType !== "image/svg+xml";
  return {
    appName: settings.appName,
    logoUrl: raster ? new URL(assetUrl(settings, "logo"), appUrl).toString() : null,
    buttonColor: settings.emailButtonColor,
    buttonTextColor: readableForeground(settings.emailButtonColor),
    accountFooter: emailFooter(settings, "account"),
    bookingFooter: emailFooter(settings, "booking"),
  };
}

export const DEFAULT_EMAIL_BRANDING: EmailBranding = emailBranding(DEFAULT_SETTINGS, "http://localhost");
