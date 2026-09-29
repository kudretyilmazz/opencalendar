import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { credential, user, webhook } from "@/db/schema";
import { createCipher } from "@/lib/crypto/encryption";
import { rotateKeys } from "@/lib/crypto/rotate";
import { resetDatabase, testDatabase } from "./helpers";

const { db, close } = testDatabase();
afterAll(close);

const OLD = Buffer.alloc(32, 1).toString("base64");
const NEW = Buffer.alloc(32, 2).toString("base64");

describe("rotate-keys (NFR-007)", () => {
  beforeEach(async () => {
    await resetDatabase(db);
    await db.execute(sql`TRUNCATE "credential", "webhook" CASCADE`);
    await db.insert(user).values({ id: "u1", name: "Ada", email: "ada@example.com", emailVerified: true });
  });

  it("re-encrypts values under the previous key with the current one, idempotently", async () => {
    const old = createCipher({ current: OLD });
    await db.insert(credential).values({ id: "c1", userId: "u1", provider: "caldav", label: "a", encryptedPayload: old.encrypt('{"password":"s3cret"}', "c1") });
    await db.insert(webhook).values({ id: "w1", ownerUserId: "u1", url: "https://example.com/hook", encryptedSecret: old.encrypt("whsec", "w1"), triggers: ["BOOKING_CREATED"] });

    const rotating = createCipher({ current: NEW, previous: OLD });
    expect(await rotateKeys(db, rotating)).toMatchObject({ credential: { checked: 1, reencrypted: 1 }, webhook: { checked: 1, reencrypted: 1 } });
    expect(await rotateKeys(db, rotating)).toMatchObject({ credential: { reencrypted: 0 }, webhook: { reencrypted: 0 } });

    // The old key can now be dropped.
    const onlyNew = createCipher({ current: NEW });
    const [c] = await db.select().from(credential).where(eq(credential.id, "c1"));
    const [w] = await db.select().from(webhook).where(eq(webhook.id, "w1"));
    expect(onlyNew.decrypt(c.encryptedPayload, "c1")).toBe('{"password":"s3cret"}');
    expect(onlyNew.decrypt(w.encryptedSecret, "w1")).toBe("whsec");
  });

  it("reports values readable with neither key and still rotates the rest", async () => {
    const stranger = createCipher({ current: Buffer.alloc(32, 3).toString("base64") });
    const old = createCipher({ current: OLD });
    await db.insert(credential).values([
      { id: "c1", userId: "u1", provider: "caldav", label: "a", encryptedPayload: stranger.encrypt("x", "c1") },
      { id: "c2", userId: "u1", provider: "caldav", label: "b", encryptedPayload: old.encrypt("y", "c2") },
    ]);
    const report = await rotateKeys(db, createCipher({ current: NEW, previous: OLD }));
    expect(report.credential).toEqual({ checked: 2, reencrypted: 1, failed: ["c1"] });
  });
});
