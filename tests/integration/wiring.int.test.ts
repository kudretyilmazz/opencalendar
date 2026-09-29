import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { user } from "@/db/schema";
import { enabledSocialProviders, isSignupOpen } from "@/features/auth/server/queries";
import { startWorker } from "@/jobs/start";
import { getEnv, resetEnvCache } from "@/lib/env";
import { getProducer } from "@/lib/jobs/boss";
import { createCipher } from "@/lib/crypto/encryption";
import { enqueue } from "@/lib/jobs/enqueue";
import { sealEmail } from "@/lib/jobs/queues";
import { resetDatabase, testDatabase } from "./helpers";

const { db, url, close } = testDatabase();
const saved = { ...process.env };

beforeAll(() => {
  process.env = {
    ...saved,
    DATABASE_URL: url,
    APP_URL: "http://localhost:3000",
    AUTH_SECRET: "x".repeat(32),
    ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1",
    SMTP_FROM: "t@x.test",
  };
  resetEnvCache();
});

afterAll(async () => {
  await (await getProducer(url)).stop({ graceful: false, close: true });
  process.env = saved;
  resetEnvCache();
  await close();
});

beforeEach(() => resetDatabase(db));

describe("job wiring", () => {
  it("reuses one producer per process and enqueues through it", async () => {
    expect(await getProducer(url)).toBe(await getProducer(url));
    const cipher = createCipher({ current: getEnv().ENCRYPTION_KEY });
    const payload = sealEmail(cipher, { to: "a@b.test", template: "magic-link", props: { url: "https://x.test" } });
    const id = await enqueue("emailSend", payload);
    expect(id).toMatch(/[0-9a-f-]{36}/);
  });

  it("starts and stops the worker role with env config", async () => {
    const worker = await startWorker(getEnv());
    expect(await worker.boss.isInstalled()).toBe(true);
    await worker.stop();
  });
});

describe("auth page queries", () => {
  it("lists only configured social providers", () => {
    const google = { clientId: "i", clientSecret: "s" };
    expect(enabledSocialProviders({ oauth: { google: null, microsoft: null, zoom: null } })).toEqual([]);
    expect(enabledSocialProviders({ oauth: { google, microsoft: { ...google, tenantId: "common" }, zoom: null } })).toEqual([
      "google",
      "microsoft",
    ]);
  });

  it("reports whether sign-up is open for the next user", async () => {
    expect(await isSignupOpen(db, { SIGNUP_MODE: "disabled" })).toBe(true); // first user bootstrap
    await db.insert(user).values({ id: "u1", name: "A", email: "a@x.test" });
    expect(await isSignupOpen(db, { SIGNUP_MODE: "disabled" })).toBe(false);
    expect(await isSignupOpen(db, { SIGNUP_MODE: "open" })).toBe(true);
  });
});
