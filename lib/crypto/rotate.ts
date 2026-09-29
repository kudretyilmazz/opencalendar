import { eq, isNotNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { booking, credential, privateLink, webhook } from "@/db/schema";
import { type Cipher, DecryptionError } from "./encryption";

/**
 * Key rotation (NFR-007): re-encrypts every value at rest that is still under
 * ENCRYPTION_KEY_PREVIOUS with ENCRYPTION_KEY. Each column uses its row id as associated data.
 * Idempotent: values already under the current key are skipped, so it can be re-run after an
 * interruption. Queued job payloads (emails, booking jobs) are short-lived and not rewritten —
 * keep the previous key configured until the queue has drained (minutes).
 */

type Row = { id: string; value: string | null };
type Target = { name: string; load: (db: Database) => Promise<Row[]>; save: (db: Database, id: string, value: string) => Promise<unknown> };

const TARGETS: readonly Target[] = [
  {
    name: "credential",
    load: (db) => db.select({ id: credential.id, value: credential.encryptedPayload }).from(credential).where(isNotNull(credential.encryptedPayload)),
    save: (db, id, value) => db.update(credential).set({ encryptedPayload: value }).where(eq(credential.id, id)),
  },
  {
    name: "webhook",
    load: (db) => db.select({ id: webhook.id, value: webhook.encryptedSecret }).from(webhook).where(isNotNull(webhook.encryptedSecret)),
    save: (db, id, value) => db.update(webhook).set({ encryptedSecret: value }).where(eq(webhook.id, id)),
  },
  {
    name: "private_link",
    load: (db) => db.select({ id: privateLink.id, value: privateLink.encryptedToken }).from(privateLink),
    save: (db, id, value) => db.update(privateLink).set({ encryptedToken: value }).where(eq(privateLink.id, id)),
  },
  {
    name: "booking",
    load: (db) => db.select({ id: booking.id, value: booking.pendingTokenSealed }).from(booking).where(isNotNull(booking.pendingTokenSealed)),
    save: (db, id, value) => db.update(booking).set({ pendingTokenSealed: value }).where(eq(booking.id, id)),
  },
  {
    name: "booking_manage_token",
    load: (db) => db.select({ id: booking.id, value: booking.manageTokenSealed }).from(booking).where(isNotNull(booking.manageTokenSealed)),
    save: (db, id, value) => db.update(booking).set({ manageTokenSealed: value }).where(eq(booking.id, id)),
  },
];

export type RotationReport = Record<string, { checked: number; reencrypted: number; failed: string[] }>;

export async function rotateKeys(db: Database, cipher: Cipher): Promise<RotationReport> {
  const report: RotationReport = {};
  for (const target of TARGETS) {
    const rows = (await target.load(db)).filter((r): r is { id: string; value: string } => r.value !== null);
    let reencrypted = 0;
    const failed: string[] = [];
    for (const row of rows) {
      try {
        if (!cipher.needsReencryption(row.value, row.id)) continue;
        await target.save(db, row.id, cipher.encrypt(cipher.decrypt(row.value, row.id), row.id));
        reencrypted += 1;
      } catch (error) {
        // Readable with neither key (corrupt, or from another key): report it and go on.
        if (!(error instanceof DecryptionError)) throw error;
        failed.push(row.id);
      }
    }
    report[target.name] = { checked: rows.length, reencrypted, failed };
  }
  return report;
}
