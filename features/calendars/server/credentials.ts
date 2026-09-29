import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { credential } from "@/db/schema";
import type { Cipher } from "@/lib/crypto/encryption";
import type { Env } from "@/lib/env";
import { IntegrationError } from "@/lib/integrations/errors";
import { needsRefresh, refreshAccessToken } from "@/lib/integrations/oauth";
import { getProvider, resolveOAuthUrls } from "@/lib/integrations/registry";
import { createProviderFetch, createSafeFetch } from "@/lib/integrations/safe-fetch";
import type { FetchLike, OAuthCredential, ProviderContext, ProviderDefinition } from "@/lib/integrations/types";
import { errorSummary, logger } from "@/lib/logger";

/** Everything the integration layer needs; injectable so tests can fake HTTP. */
export type IntegrationDeps = {
  db: Database;
  cipher: Cipher;
  env: Env;
  /** Provider APIs get a plain timeout fetch; user-supplied URLs (CalDAV, ICS) the SSRF-safe one. */
  fetchFor(provider: ProviderDefinition<unknown>): FetchLike;
  /** Called once when a credential turns invalid (INT-012), e.g. to email the owner. */
  onCredentialInvalid(info: { userId: string; credentialId: string; provider: ProviderDefinition<unknown>; label: string }): Promise<void>;
  now(): number;
};

export function defaultFetchFor(env: Env) {
  const safe = createSafeFetch({ allowPrivate: env.ALLOW_PRIVATE_NETWORK_INTEGRATIONS, timeoutMs: 10_000 });
  const api = createProviderFetch(10_000);
  return (provider: ProviderDefinition<unknown>): FetchLike => (provider.auth === "oauth2" ? api : safe);
}

export type CredentialRow = typeof credential.$inferSelect;

export function decryptCredential(cipher: Cipher, row: CredentialRow): unknown {
  return getProvider(row.provider).credentialSchema.parse(JSON.parse(cipher.decrypt(row.encryptedPayload, row.id)));
}

async function writePayload(deps: Pick<IntegrationDeps, "db" | "cipher">, id: string, payload: unknown) {
  await deps.db.update(credential).set({ encryptedPayload: deps.cipher.encrypt(JSON.stringify(payload), id) }).where(eq(credential.id, id));
}

/** Marks a credential invalid; returns true only for the first transition (to notify once). */
export async function markCredentialInvalid(db: Database, id: string, reason: string, now: number): Promise<boolean> {
  const updated = await db
    .update(credential)
    .set({ invalidAt: new Date(now), lastError: reason.slice(0, 500) })
    .where(and(eq(credential.id, id), isNull(credential.invalidAt)))
    .returning({ id: credential.id });
  return updated.length > 0;
}

/**
 * Refreshes an OAuth token under a per-credential advisory lock, so concurrent workers never
 * invalidate each other's rotating refresh tokens.
 */
async function refreshIfNeeded(deps: IntegrationDeps, row: CredentialRow, provider: ProviderDefinition<unknown>): Promise<unknown> {
  const current = decryptCredential(deps.cipher, row) as OAuthCredential;
  if (provider.auth !== "oauth2" || !needsRefresh(current, deps.now())) return current;
  const client = provider.client?.(deps.env);
  const oauth = resolveOAuthUrls(provider, deps.env);
  if (!client || !oauth) throw new IntegrationError("auth", `${provider.name} is no longer configured on this instance`);
  return deps.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`credential:${row.id}`}))`);
    const [fresh] = await tx.select().from(credential).where(eq(credential.id, row.id));
    const latest = decryptCredential(deps.cipher, fresh) as OAuthCredential;
    if (!needsRefresh(latest, deps.now())) return latest; // another worker refreshed meanwhile
    const next = await refreshAccessToken(deps.fetchFor(provider), oauth, client, latest, deps.now());
    await tx.update(credential).set({ encryptedPayload: deps.cipher.encrypt(JSON.stringify(next), row.id) }).where(eq(credential.id, row.id));
    return next;
  });
}

/**
 * Runs `fn` with a ready provider context. Auth failures mark the credential invalid and notify
 * the owner once (INT-012); every error is re-thrown as an IntegrationError.
 */
export async function withCredential<T>(
  deps: IntegrationDeps,
  credentialId: string,
  fn: (ctx: ProviderContext<unknown>, provider: ProviderDefinition<unknown>, row: CredentialRow) => Promise<T>,
): Promise<T> {
  const [row] = await deps.db.select().from(credential).where(eq(credential.id, credentialId));
  if (!row) throw new IntegrationError("not_found", "Credential not found");
  const provider = getProvider(row.provider);
  try {
    const payload = await refreshIfNeeded(deps, row, provider);
    const ctx: ProviderContext<unknown> = {
      credential: payload,
      fetch: deps.fetchFor(provider),
      saveCredential: (next) => writePayload(deps, row.id, next),
    };
    return await fn(ctx, provider, row);
  } catch (error) {
    const normalized = error instanceof IntegrationError ? error : new IntegrationError("transient", `${provider.name} request failed`);
    if (normalized.kind === "auth" && (await markCredentialInvalid(deps.db, row.id, normalized.message, deps.now()))) {
      logger.warn("integration.credential_invalid", { credentialId: row.id, provider: row.provider });
      await deps.onCredentialInvalid({ userId: row.userId, credentialId: row.id, provider, label: row.label }).catch((e) =>
        logger.error("integration.notify_failed", errorSummary(e)),
      );
    }
    throw normalized;
  }
}
