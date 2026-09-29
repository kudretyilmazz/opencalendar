import type { Env } from "@/lib/env";
import { caldav, icsFeed } from "./caldav";
import { google } from "./google";
import { microsoft } from "./microsoft";
import type { ProviderDefinition, ProviderId } from "./types";
import { zoom } from "./zoom";

/**
 * All providers, in display order. A plain map: no code generation, no dynamic imports.
 * Credential types are erased here; every stored credential is re-validated with the
 * provider's `credentialSchema` before use.
 */
export const PROVIDERS = { google, microsoft, caldav, ics_feed: icsFeed, zoom } as unknown as Record<ProviderId, ProviderDefinition<unknown>>;

export const isProviderId = (id: string): id is ProviderId => Object.hasOwn(PROVIDERS, id);

export function getProvider(id: string): ProviderDefinition<unknown> {
  if (!isProviderId(id)) throw new Error(`Unknown provider "${id}"`);
  return PROVIDERS[id];
}

/** OAuth providers need their client configured at runtime; others are always available (INT-013). */
export function isProviderConfigured(provider: ProviderDefinition<unknown>, env: Env): boolean {
  return provider.auth !== "oauth2" || Boolean(provider.client?.(env));
}

export function listProviders(env: Env) {
  return Object.values(PROVIDERS).map((provider) => ({ provider, configured: isProviderConfigured(provider, env) }));
}

/** Microsoft endpoints include the tenant (MICROSOFT_TENANT_ID). */
export function resolveOAuthUrls(provider: ProviderDefinition<unknown>, env: Env) {
  const tenant = env.oauth.microsoft?.tenantId ?? "common";
  const fill = (url: string) => url.replace("{tenant}", encodeURIComponent(tenant));
  return provider.oauth ? { ...provider.oauth, authorizeUrl: fill(provider.oauth.authorizeUrl), tokenUrl: fill(provider.oauth.tokenUrl) } : undefined;
}
