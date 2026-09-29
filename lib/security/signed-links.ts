import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, expiring action links (BKG-012 one-click accept/reject in emails). The signature
 * binds the subject, the action and the expiry; the secret is derived from AUTH_SECRET with a
 * purpose label so it can't be confused with other uses of the key.
 */

export type SignedAction = { subject: string; action: string; expiresAt: number };

const key = (secret: string) => createHmac("sha256", secret).update("opencalendar:signed-link:v1").digest();

export function signAction(secret: string, input: SignedAction): string {
  return createHmac("sha256", key(secret)).update(`${input.subject}|${input.action}|${input.expiresAt}`).digest("base64url");
}

export function verifyAction(secret: string, input: SignedAction, signature: string | null | undefined, now: number): boolean {
  if (!signature || signature.length > 100 || !Number.isSafeInteger(input.expiresAt) || input.expiresAt < now) return false;
  const expected = Buffer.from(signAction(secret, input));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
