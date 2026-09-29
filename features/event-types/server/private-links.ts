import { personalOf } from "@/features/event-types/server/service";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { eventType, privateLink } from "@/db/schema";
import type { Cipher } from "@/lib/crypto/encryption";
import { hashToken, newId, randomToken } from "@/lib/ids";
import { EventTypeError } from "./service";

/**
 * Single-use private links (EVT-015). The token is looked up by hash; an encrypted copy (row id
 * as AAD) lets the host copy an unused link again. A link is consumed by the booking that uses it.
 */

export type PrivateLinkView = { id: string; token: string; expiresAt: Date | null; usedAt: Date | null; createdAt: Date };

const MAX_LINKS = 100;

async function assertOwned(db: Database, userId: string, eventTypeId: string) {
  const [row] = await db.select({ id: eventType.id }).from(eventType).where(and(eq(eventType.id, eventTypeId), personalOf(userId)));
  if (!row) throw new EventTypeError("NOT_FOUND");
}

export async function createPrivateLink(db: Database, cipher: Cipher, userId: string, eventTypeId: string, expiresAt: Date | null): Promise<string> {
  await assertOwned(db, userId, eventTypeId);
  const existing = await db.select({ id: privateLink.id }).from(privateLink).where(eq(privateLink.eventTypeId, eventTypeId));
  if (existing.length >= MAX_LINKS) throw new EventTypeError("NOT_FOUND");
  const id = newId();
  const token = randomToken(24);
  await db.insert(privateLink).values({ id, eventTypeId, tokenHash: hashToken(token), encryptedToken: cipher.encrypt(token, id), expiresAt });
  return token;
}

export async function listPrivateLinks(db: Database, cipher: Cipher, userId: string, eventTypeId: string): Promise<PrivateLinkView[]> {
  await assertOwned(db, userId, eventTypeId);
  const rows = await db.select().from(privateLink).where(eq(privateLink.eventTypeId, eventTypeId)).orderBy(desc(privateLink.createdAt));
  return rows.map((r) => ({ id: r.id, token: cipher.decrypt(r.encryptedToken, r.id), expiresAt: r.expiresAt, usedAt: r.usedAt, createdAt: r.createdAt }));
}

export async function deletePrivateLink(db: Database, userId: string, eventTypeId: string, id: string): Promise<void> {
  await assertOwned(db, userId, eventTypeId);
  await db.delete(privateLink).where(and(eq(privateLink.id, id), eq(privateLink.eventTypeId, eventTypeId)));
}

/** Is this a usable link for the event type (for showing the booking page)? */
export async function isUsablePrivateLink(db: Database, eventTypeId: string, token: string | undefined, now: number): Promise<boolean> {
  if (!token || token.length > 128) return false;
  const [row] = await db
    .select({ usedAt: privateLink.usedAt, expiresAt: privateLink.expiresAt })
    .from(privateLink)
    .where(and(eq(privateLink.tokenHash, hashToken(token)), eq(privateLink.eventTypeId, eventTypeId)));
  return Boolean(row && !row.usedAt && (!row.expiresAt || row.expiresAt.getTime() > now));
}
