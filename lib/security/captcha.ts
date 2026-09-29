import { createHmac } from "node:crypto";
import { createChallenge, verifySolution } from "altcha-lib/v1";
import { lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import { captchaSolution } from "@/db/schema";

/**
 * Optional anti-abuse check for public booking (ADM-007): ALTCHA proof-of-work. The browser
 * spends ~0.1–0.5 s of CPU to solve a signed challenge; nothing is sent to third parties.
 *
 * Replay protection is keyed on the challenge *signature* (not the encoded payload, which can be
 * re-encoded) and stored in the database, so it holds across restarts and replicas.
 */

export const CAPTCHA_TTL_MS = 10 * 60_000;
const MAX_NUMBER = 100_000;

/** A key only for this purpose, derived from AUTH_SECRET. */
const hmacKey = (secret: string) => createHmac("sha256", secret).update("opencalendar:captcha:v1").digest("hex");

export async function newChallenge(secret: string, now = Date.now()) {
  return createChallenge({ hmacKey: hmacKey(secret), maxnumber: MAX_NUMBER, expires: new Date(now + CAPTCHA_TTL_MS) });
}

function signatureOf(payload: string): string | null {
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as { signature?: unknown };
    return typeof decoded.signature === "string" && decoded.signature.length <= 200 ? decoded.signature : null;
  } catch {
    return null;
  }
}

export async function verifyCaptcha(db: Database, secret: string, payload: string | undefined, now = Date.now()): Promise<boolean> {
  if (!payload || payload.length > 2000) return false;
  const signature = signatureOf(payload);
  if (!signature) return false;
  try {
    if (!(await verifySolution(payload, hmacKey(secret), true))) return false;
  } catch {
    return false;
  }
  // First use wins; any re-encoding of the same solution has the same signature.
  const inserted = await db
    .insert(captchaSolution)
    .values({ signature, expiresAt: new Date(now + CAPTCHA_TTL_MS) })
    .onConflictDoNothing()
    .returning({ signature: captchaSolution.signature });
  return inserted.length === 1;
}

/** Maintenance: forget solutions whose challenge has expired anyway. */
export async function pruneCaptchaSolutions(db: Database, now: number): Promise<void> {
  await db.delete(captchaSolution).where(lt(captchaSolution.expiresAt, new Date(now)));
}
