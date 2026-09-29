import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { sha256 } from "@/lib/crypto/encryption";

export const newId = (): string => randomUUID();

/** URL-safe random token. 16 bytes = 128 bits (booking uids), 32 bytes for secrets (BKG-011). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export const hashToken = (token: string): string => sha256(token);

/** Constant-time comparison of a presented token against a stored SHA-256 hash. */
export function tokenMatches(token: string | null | undefined, storedHash: string): boolean {
  if (!token || token.length > 256) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
