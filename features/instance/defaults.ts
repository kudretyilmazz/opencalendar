import type { InstanceTheme } from "@/db/schema";
import type { SignupMode } from "@/lib/auth/policy";

export const ASSET_KINDS = ["logo", "logo_dark", "favicon", "apple_icon"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const RADII = ["0rem", "0.375rem", "0.625rem", "1rem"] as const;
export type Radius = (typeof RADII)[number];

export type ThemeChoice = "system" | "light" | "dark";
export type AssetRef = { sha256: string; mimeType: string };

/** Instance settings with every default applied; consumers never see null for display values. */
export type ResolvedSettings = {
  appName: string;
  description: string;
  hidePoweredBy: boolean;
  hideSourceLink: boolean;
  theme: InstanceTheme;
  radius: Radius | null;
  defaultTheme: ThemeChoice;
  emailFooterText: string | null;
  emailButtonColor: string;
  /** null: the SIGNUP_MODE environment variable decides. */
  signupMode: SignupMode | null;
  landingHeadline: string;
  landingBody: string;
  loginMessage: string | null;
  oauthGoogleHidden: boolean;
  oauthMicrosoftHidden: boolean;
  defaultTimeZone: string | null;
  defaultWeekStart: number | null;
  defaultTimeFormat: number | null;
  assets: Partial<Record<AssetKind, AssetRef>>;
};

/** Today's built-in branding: an uncustomized instance looks exactly like OpenCalendar always did. */
export const DEFAULT_SETTINGS: ResolvedSettings = {
  appName: "OpenCalendar",
  description: "Open-source scheduling you can host yourself.",
  hidePoweredBy: false,
  hideSourceLink: false,
  theme: {},
  radius: null,
  defaultTheme: "system",
  emailFooterText: null,
  emailButtonColor: "#111827",
  signupMode: null,
  landingHeadline: "Scheduling you can host yourself",
  landingBody:
    "OpenCalendar is an open-source alternative to Calendly and Cal.com. Share a link, let people book time with you, and keep your data on your own server.",
  loginMessage: null,
  oauthGoogleHidden: false,
  oauthMicrosoftHidden: false,
  defaultTimeZone: null,
  defaultWeekStart: null,
  defaultTimeFormat: null,
  assets: {},
};

/** The DB value wins; otherwise the SIGNUP_MODE environment variable (ADR-0007). */
export function resolveSignupMode(settings: Pick<ResolvedSettings, "signupMode">, envMode: SignupMode): SignupMode {
  return settings.signupMode ?? envMode;
}

/** Cache-busted public URL of an uploaded asset, or of the built-in default when none is uploaded. */
export function assetUrl(settings: Pick<ResolvedSettings, "assets">, kind: AssetKind): string {
  const ref = settings.assets[kind];
  return ref ? `/api/branding/${kind}?v=${ref.sha256.slice(0, 16)}` : `/api/branding/${kind}`;
}
