import { z } from "zod";
import type { Cipher } from "@/lib/crypto/encryption";

/**
 * OAuth "connect" state kept in an encrypted, short-lived cookie (docs/03-architecture/integrations.md):
 * binds the redirect to the signed-in user, the provider and the PKCE verifier (CSRF + code
 * injection protection).
 */

export const OAUTH_COOKIE = "oc_oauth";
export const OAUTH_STATE_TTL_MS = 10 * 60_000;
const AAD = "opencalendar:oauth-state";

const stateSchema = z.object({
  state: z.string().min(16),
  verifier: z.string().min(43),
  provider: z.string(),
  userId: z.string(),
  expiresAt: z.number(),
});
export type OAuthState = z.infer<typeof stateSchema>;

export const sealOAuthState = (cipher: Cipher, value: OAuthState) => cipher.encrypt(JSON.stringify(value), AAD);

export type StateCheck =
  | { ok: true; state: OAuthState }
  | { ok: false; reason: "missing" | "tampered" | "expired" | "mismatch" };

/** Verifies the cookie against the callback's `state`, provider and the current session user. */
export function checkOAuthState(
  cipher: Cipher,
  cookie: string | undefined,
  expected: { state: string | null; provider: string; userId: string | undefined; now: number },
): StateCheck {
  if (!cookie) return { ok: false, reason: "missing" };
  let parsed: OAuthState;
  try {
    parsed = stateSchema.parse(JSON.parse(cipher.decrypt(cookie, AAD)));
  } catch {
    return { ok: false, reason: "tampered" };
  }
  if (parsed.expiresAt < expected.now) return { ok: false, reason: "expired" };
  if (!expected.state || parsed.state !== expected.state || parsed.provider !== expected.provider || parsed.userId !== expected.userId) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, state: parsed };
}
