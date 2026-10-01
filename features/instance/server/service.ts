import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { instanceAsset, instanceSettings } from "@/db/schema";
import type { SignupMode } from "@/lib/auth/policy";
import { TtlCache } from "@/lib/ttl-cache";
import type { ImageMime } from "../assets";
import { type AssetKind, DEFAULT_SETTINGS, type Radius, type ResolvedSettings, type ThemeChoice } from "../defaults";
import type { BrandingInput, EmailInput, PlatformInput, ThemeInput } from "../schemas";

export type SettingsPatch = Partial<BrandingInput & ThemeInput & EmailInput & PlatformInput>;

/** Reads the settings row and asset hashes and applies the defaults. Uncached; see getInstanceSettings. */
export async function loadInstanceSettings(db: Database): Promise<ResolvedSettings> {
  const [[row], assets] = await Promise.all([
    db.select().from(instanceSettings).where(eq(instanceSettings.id, 1)),
    db.select({ kind: instanceAsset.kind, sha256: instanceAsset.sha256, mimeType: instanceAsset.mimeType }).from(instanceAsset),
  ]);
  const d = DEFAULT_SETTINGS;
  return {
    appName: row?.appName ?? d.appName,
    description: row?.description ?? d.description,
    hidePoweredBy: row?.hidePoweredBy ?? d.hidePoweredBy,
    hideSourceLink: row?.hideSourceLink ?? d.hideSourceLink,
    theme: row?.theme ?? d.theme,
    radius: (row?.radius as Radius | null) ?? d.radius,
    defaultTheme: (row?.defaultTheme as ThemeChoice | null) ?? d.defaultTheme,
    emailFooterText: row?.emailFooterText ?? d.emailFooterText,
    emailButtonColor: row?.emailButtonColor ?? d.emailButtonColor,
    signupMode: (row?.signupMode as SignupMode | null) ?? d.signupMode,
    landingHeadline: row?.landingHeadline ?? d.landingHeadline,
    landingBody: row?.landingBody ?? d.landingBody,
    loginMessage: row?.loginMessage ?? d.loginMessage,
    oauthGoogleHidden: row?.oauthGoogleHidden ?? d.oauthGoogleHidden,
    oauthMicrosoftHidden: row?.oauthMicrosoftHidden ?? d.oauthMicrosoftHidden,
    defaultTimeZone: row?.defaultTimeZone ?? d.defaultTimeZone,
    defaultWeekStart: row?.defaultWeekStart ?? d.defaultWeekStart,
    defaultTimeFormat: row?.defaultTimeFormat ?? d.defaultTimeFormat,
    assets: Object.fromEntries(assets.map((a) => [a.kind, { sha256: a.sha256, mimeType: a.mimeType }])),
  };
}

/**
 * Settings are read on every page render, so each process caches them briefly (the same pattern
 * as the public booking context). Saves clear this process's cache at once; other replicas
 * catch up within the TTL.
 */
export const INSTANCE_SETTINGS_TTL_MS = 15_000;

const globalCaches = globalThis as typeof globalThis & { __ocInstanceSettingsCache?: TtlCache<ResolvedSettings> };
const cache = (globalCaches.__ocInstanceSettingsCache ??= new TtlCache<ResolvedSettings>(INSTANCE_SETTINGS_TTL_MS, 1));

export function getInstanceSettings(db: Database): Promise<ResolvedSettings> {
  return cache.get("settings", () => loadInstanceSettings(db));
}

export function invalidateInstanceSettings(): void {
  cache.clear();
}

/** Upserts the single settings row; only the given fields change. */
export async function updateInstanceSettings(db: Database, patch: SettingsPatch, actorId: string): Promise<void> {
  const values = { ...patch, updatedAt: new Date(), updatedBy: actorId };
  await db
    .insert(instanceSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: instanceSettings.id, set: values });
  invalidateInstanceSettings();
}

export async function putAsset(db: Database, kind: AssetKind, bytes: Uint8Array, mimeType: ImageMime): Promise<string> {
  const buffer = Buffer.from(bytes);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const values = { bytes: buffer, mimeType, sha256, sizeBytes: buffer.byteLength, updatedAt: new Date() };
  await db.insert(instanceAsset).values({ kind, ...values }).onConflictDoUpdate({ target: instanceAsset.kind, set: values });
  invalidateInstanceSettings();
  return sha256;
}

export async function deleteAsset(db: Database, kind: AssetKind): Promise<void> {
  await db.delete(instanceAsset).where(eq(instanceAsset.kind, kind));
  invalidateInstanceSettings();
}

export async function getAsset(db: Database, kind: AssetKind): Promise<{ bytes: Buffer; mimeType: string; sha256: string } | null> {
  const [row] = await db
    .select({ bytes: instanceAsset.bytes, mimeType: instanceAsset.mimeType, sha256: instanceAsset.sha256 })
    .from(instanceAsset)
    .where(eq(instanceAsset.kind, kind));
  return row ?? null;
}
