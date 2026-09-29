import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets stored at rest (integration credentials, NFR-007).
 * Ciphertext format: `v1:<iv>:<tag>:<data>` (base64 parts). During key rotation the previous key
 * is tried after the current one, so rotation only needs ENCRYPTION_KEY + ENCRYPTION_KEY_PREVIOUS.
 */

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class DecryptionError extends Error {
  constructor(message = "Unable to decrypt value") {
    super(message);
    this.name = "DecryptionError";
  }
}

export type CipherKeys = { current: string; previous?: string };

export type Cipher = {
  /** `aad` (associated data, e.g. a row id) must be passed again to decrypt. */
  encrypt(plaintext: string, aad?: string): string;
  decrypt(ciphertext: string, aad?: string): string;
  /** True when the value was written with the previous key and should be re-encrypted. */
  needsReencryption(ciphertext: string, aad?: string): boolean;
};

function toKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes (base64 encoded)");
  return key;
}

function decryptWith(key: Buffer, ciphertext: string, aad?: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new DecryptionError("Malformed ciphertext");
  const [, iv, tag, data] = parts.map((part, i) => (i === 0 ? part : Buffer.from(part, "base64")));
  // Full-length IV and tag only: Node would otherwise accept a truncated authentication tag.
  if ((iv as Buffer).length !== IV_BYTES || (tag as Buffer).length !== TAG_BYTES) throw new DecryptionError("Malformed ciphertext");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv as Buffer, { authTagLength: TAG_BYTES });
    if (aad !== undefined) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag as Buffer);
    return Buffer.concat([decipher.update(data as Buffer), decipher.final()]).toString("utf8");
  } catch {
    throw new DecryptionError();
  }
}

export function createCipher(keys: CipherKeys): Cipher {
  const current = toKey(keys.current);
  const previous = keys.previous ? toKey(keys.previous) : undefined;

  const tryDecrypt = (ciphertext: string, aad?: string): { plaintext: string; usedPrevious: boolean } => {
    try {
      return { plaintext: decryptWith(current, ciphertext, aad), usedPrevious: false };
    } catch (error) {
      if (!previous) throw error;
      return { plaintext: decryptWith(previous, ciphertext, aad), usedPrevious: true };
    }
  };

  return {
    encrypt(plaintext, aad) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", current, iv);
      if (aad !== undefined) cipher.setAAD(Buffer.from(aad, "utf8"));
      const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv, tag, data].map((p) => (typeof p === "string" ? p : p.toString("base64"))).join(":");
    },
    decrypt: (ciphertext, aad) => tryDecrypt(ciphertext, aad).plaintext,
    needsReencryption: (ciphertext, aad) => tryDecrypt(ciphertext, aad).usedPrevious,
  };
}

/** SHA-256 hex digest, used for storing tokens and API keys hashed (NFR-007). */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Cipher for the configured ENCRYPTION_KEY (and ENCRYPTION_KEY_PREVIOUS during rotation). */
export function cipherFromEnv(env: { ENCRYPTION_KEY: string; ENCRYPTION_KEY_PREVIOUS?: string }): Cipher {
  return createCipher({ current: env.ENCRYPTION_KEY, previous: env.ENCRYPTION_KEY_PREVIOUS });
}
